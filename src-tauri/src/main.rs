#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    ffi::OsStr,
    fs,
    io::{Read, Write},
    os::windows::{ffi::OsStrExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;
use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

const NO_WINDOW: u32 = 0x08000000;

fn data_dir() -> Result<PathBuf, String> {
    if let Some(p) = std::env::var_os("RB_USER_DATA") { return Ok(p.into()); }
    let root = std::env::var_os("APPDATA").ok_or("Windows AppData directory is unavailable")?;
    Ok(PathBuf::from(root).join(if cfg!(debug_assertions) { "RB Tracker Dev" } else { "RB Tracker" }))
}

fn ring_file() -> Result<PathBuf, String> { Ok(data_dir()?.join("rb-tracker-data.json")) }
fn shipment_file() -> Result<PathBuf, String> { Ok(data_dir()?.join("shipment-data.json")) }
fn valid_rings(text: &str) -> bool {
    serde_json::from_str::<Value>(text).ok().and_then(|v| v.get("rings").cloned()).is_some_and(|v| v.is_array())
}
fn valid_shipments(text: &str) -> bool {
    serde_json::from_str::<Value>(text).is_ok_and(|v| v.is_object())
}
fn wide(s: &OsStr) -> Vec<u16> { s.encode_wide().chain(Some(0)).collect() }

// Replace without exposing a partially written file, including when the target exists.
fn atomic_write(path: &Path, text: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid data path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    drop(file);
    let ok = unsafe { MoveFileExW(wide(tmp.as_os_str()).as_ptr(), wide(path.as_os_str()).as_ptr(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) };
    if ok == 0 { return Err(std::io::Error::last_os_error().to_string()); }
    Ok(())
}

fn backup_name(name: &str) -> bool {
    let Some(date) = name.strip_prefix("rb-tracker-data-").and_then(|s| s.strip_suffix(".json")) else { return false; };
    date.len() == 10 && date.chars().enumerate().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
}
fn backup_paths() -> Result<Vec<PathBuf>, String> {
    let dir = data_dir()?.join("backups");
    if !dir.exists() { return Ok(vec![]); }
    let mut paths = fs::read_dir(dir).map_err(|e| e.to_string())?.filter_map(Result::ok)
        .map(|e| e.path()).filter(|p| p.file_name().and_then(OsStr::to_str).is_some_and(backup_name)).collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}
fn backup_ring_file(text: &str) -> Result<(), String> {
    let dir = data_dir()?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("rb-tracker-data-{}.json", Local::now().format("%Y-%m-%d")));
    if !target.exists() { fs::write(target, text).map_err(|e| e.to_string())?; }
    let paths = backup_paths()?;
    for path in paths.iter().take(paths.len().saturating_sub(60)) { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadResult { json: Option<String>, #[serde(skip_serializing_if = "Option::is_none")] recovered_from: Option<String> }

#[tauri::command]
fn load_data() -> Result<LoadResult, String> {
    let path = ring_file()?;
    if !path.exists() { return Ok(LoadResult { json: None, recovered_from: None }); }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if valid_rings(&text) {
        backup_ring_file(&text)?;
        return Ok(LoadResult { json: Some(text), recovered_from: None });
    }
    let damaged = path.with_file_name(format!("rb-tracker-data.damaged-{}.json", Local::now().timestamp_millis()));
    fs::copy(&path, damaged).map_err(|e| e.to_string())?;
    for backup in backup_paths()?.iter().rev() {
        if let Ok(s) = fs::read_to_string(backup) {
            if valid_rings(&s) {
                return Ok(LoadResult { json: Some(s), recovered_from: backup.file_name().map(|x| x.to_string_lossy().into_owned()) });
            }
        }
    }
    Err("Your tracker file is damaged and no valid backup was found. The original was kept.".into())
}
#[tauri::command]
fn save_data(json: String) -> Result<(), String> {
    if !valid_rings(&json) { return Err("Refusing to save invalid tracker data".into()); }
    atomic_write(&ring_file()?, &json)
}
#[tauri::command]
fn load_shipments() -> Result<Option<String>, String> {
    let path = shipment_file()?;
    if !path.exists() { return Ok(None); }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if !valid_shipments(&text) { return Err("Shipment data is damaged; the original file was kept.".into()); }
    Ok(Some(text))
}
#[tauri::command]
fn save_shipments(json: String) -> Result<(), String> {
    if !valid_shipments(&json) { return Err("Refusing to save invalid shipment data".into()); }
    atomic_write(&shipment_file()?, &json)
}
#[tauri::command]
fn data_path() -> Result<String, String> { Ok(ring_file()?.to_string_lossy().into_owned()) }
#[tauri::command]
fn open_data_folder() -> Result<(), String> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Command::new("explorer.exe").arg(dir).creation_flags(NO_WINDOW).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn export_csv(file_name: String, text: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = Path::new(&file_name).file_name().unwrap_or(OsStr::new("rb-tracker.csv"));
        let selected = rfd::FileDialog::new().set_title("Export to Excel").set_file_name(name.to_string_lossy().as_ref()).add_filter("CSV (Excel)", &["csv"]).save_file();
        if let Some(path) = selected { fs::write(path, format!("\u{feff}{text}")).map_err(|e| e.to_string())?; Ok(true) } else { Ok(false) }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn track_shipment(app: tauri::AppHandle, number: String, carrier: Option<String>, postcode: Option<String>) -> Result<Value, String> {
    let root = app.path().resource_dir().map_err(|e| e.to_string())?.join("tracking");
    tauri::async_runtime::spawn_blocking(move || {
        let mut child = Command::new(root.join("node.exe")).arg(root.join("worker.mjs"))
            .creation_flags(NO_WINDOW).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("Could not start tracking engine: {e}"))?;
        let mut stdin = child.stdin.take().ok_or("Tracking input unavailable")?;
        let input = serde_json::to_string(&json!({"number": number, "carrier": carrier, "postcode": postcode})).map_err(|e| e.to_string())?;
        stdin.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        drop(stdin);
        let stdout = child.stdout.take().ok_or("Tracking output unavailable")?;
        let reader = thread::spawn(move || { let mut bytes = Vec::new(); stdout.take(1_000_001).read_to_end(&mut bytes).map(|_| bytes) });
        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { break status; }
            if started.elapsed() >= Duration::from_secs(90) { let _ = child.kill(); let _ = child.wait(); return Err("Tracking request timed out".into()); }
            thread::sleep(Duration::from_millis(100));
        };
        let bytes = reader.join().map_err(|_| "Tracking output could not be read")?.map_err(|e| e.to_string())?;
        if bytes.len() > 1_000_000 { return Err("Tracking response was too large".into()); }
        if !status.success() { return Err("Tracking engine failed".into()); }
        serde_json::from_slice(&bytes).map_err(|_| "Tracking engine returned an invalid response".into())
    }).await.map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.set_focus(); }
        }))
        .invoke_handler(tauri::generate_handler![load_data, save_data, load_shipments, save_shipments, data_path, open_data_folder, export_csv, track_shipment])
        .run(tauri::generate_context!())
        .expect("error while running RB Tracker");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_legacy_ring_structure() {
        assert!(valid_rings(r#"{"version":1,"rings":[],"settings":{}}"#));
        assert!(!valid_rings(r#"{"rings":{}}"#));
        assert!(!valid_rings("not json"));
    }

    #[test]
    fn only_daily_backups_are_considered() {
        assert!(backup_name("rb-tracker-data-2026-11-17.json"));
        assert!(!backup_name("rb-tracker-data.damaged-123.json"));
        assert!(!backup_name("rb-tracker-data-2026-xx-17.json"));
    }

    #[test]
    fn atomic_write_replaces_existing_file() {
        let path = std::env::temp_dir().join(format!("rb-tracker-atomic-{}-{}.json", std::process::id(), Local::now().timestamp_millis()));
        atomic_write(&path, "first").unwrap();
        atomic_write(&path, "second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        fs::remove_file(path).unwrap();
    }
}

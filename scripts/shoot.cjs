// Screenshot check of the real desktop app with sample data.
// Usage: npx vite build && npx electron scripts/shoot.cjs <outDir>
// Writes sample data into <outDir>/userdata (never the real data folder),
// opens every section and saves PNGs into <outDir>.

const { app, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const outDir = path.resolve(process.argv[process.argv.length - 1]);
const dataDir = path.join(outDir, "userdata");
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const now = new Date();
function daysAgo(n, hour = 11) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hour, 20);
  return d.toISOString();
}
let id = 0;
function ring(label, key, trips) {
  return { id: `s${++id}`, key, label, createdAt: trips[0].sentAt, trips };
}
const t = (kind, sent, recv) => ({ kind, sentAt: daysAgo(sent), receivedAt: recv === null ? null : daysAgo(recv, 16) });
const rings = [
  ring("K-1101", "1101", [t("new", 9, null)]),
  ring("K-1102", "1102", [t("new", 8, null)]),
  ring("K-1103", "1103", [t("new", 7, null)]),
  ring("K-1104", "1104", [t("new", 6, null)]),
  ring("K-1105", "1105", [t("new", 6, null)]),
  ring("K-1106", "1106", [t("new", 4, null)]),
  ring("K-1107", "1107", [t("new", 2, null)]),
  ring("K-1108", "1108", [t("new", 0, null)]),
  ring("K-1109", "1109", [t("new", 0, null)]),
  ring("K-1090", "1090", [t("new", 8, 0)]),
  ring("K-1091", "1091", [t("new", 5, 0)]),
  ring("K-1092", "1092", [t("new", 6, 1)]),
  ring("K-1080", "1080", [t("new", 12, 7), t("repair", 4, null)]),
  ring("K-1081", "1081", [t("new", 10, 5), t("repair", 2, null)]),
  ring("K-1082", "1082", [t("new", 14, 8), t("repair", 6, 3)]),
];
fs.writeFileSync(
  path.join(dataDir, "rb-tracker-data.json"),
  JSON.stringify({ version: 1, rings, settings: { businessName: "Kanishka Jewels", newDays: 6, repairDays: 2 } }),
);
process.env.RB_USER_DATA = dataDir;

require("../electron/main.cjs");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on("browser-window-created", (_e, win) => {
  if (process.env.SHOOT_THEME) nativeTheme.themeSource = process.env.SHOOT_THEME;
  win.webContents.once("did-finish-load", async () => {
    win.setSize(1440, 900);
    await wait(1200);
    const wc = win.webContents;
    const shot = async (name) => {
      await wait(400);
      const img = await wc.capturePage();
      fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    };
    const click = (text) =>
      wc.executeJavaScript(
        `[...document.querySelectorAll('nav button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click()`,
      );
    await shot("1-today");
    // Paste a list into the quick box to show the preview.
    await wc.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea');
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, '1101\\nK-1090\\nK-1110\\nK-1111\\nK-1108\\nhello');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await shot("2-paste-preview");
    await wc.executeJavaScript(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`);
    await shot("3-after-save");
    for (const [i, name] of ["At manufacturer", "Late", "Repairs", "Received", "All orders", "Settings"].entries()) {
      await click(name);
      await shot(`${4 + i}-${name.toLowerCase().replace(/ /g, "-")}`);
    }
    await click("All orders");
    await wc.executeJavaScript(`document.querySelector('[role=row][class*=group]')?.click()`);
    await shot("10-detail");
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, "rb-tracker-data.json"), "utf8"));
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify({ rings: saved.rings.length }, null, 2));
    app.quit();
  });
});

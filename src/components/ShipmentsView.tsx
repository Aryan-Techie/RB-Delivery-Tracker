import { useMemo, useState } from "react";
import { FileUp, RefreshCw, X } from "lucide-react";
import { Button, Card, ConfirmButton, Empty, Pill } from "./ui";
import { parseShipmentWorkbook, type ImportResult } from "../lib/shipment-import";
import { alertReasons, fromImport, type Shipment, type ShipmentData, type ShipmentStage } from "../lib/shipments";

const STAGES: Record<ShipmentStage, string> = { unknown: "Not confirmed", pre_transit: "Pre-transit", in_transit: "In transit", out_for_delivery: "Out for delivery", delivered: "Delivered", exception: "Exception" };
type Update = (fn: (current: ShipmentData) => ShipmentData) => void;
export function ShipmentsView({ data, update, today, checking, notice, refresh }: { data: ShipmentData; update: Update; today: string; checking: string | null; notice: string; refresh: (s: Shipment) => Promise<void> }) {
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("attention");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const known = new Set(data.shipments.map(s => s.trackingNumber.toUpperCase()));
  const newRows = preview?.shipments.filter(s => !known.has(s.trackingNumber.toUpperCase())) ?? [];
  const list = useMemo(() => data.shipments.filter(s => {
    const text = [s.name, s.trackingNumber, s.shop, s.awb].join(" ").toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (filter === "all" || (filter === "attention" ? alertReasons(s, data.settings, today).length > 0 : s.stage === filter));
  }).sort((a, b) => Number(alertReasons(b, data.settings, today).length > 0) - Number(alertReasons(a, data.settings, today).length > 0)), [data, query, filter, today]);
  const opened = data.shipments.find(s => s.id === selected);
  const updateOne = (id: string, fn: (s: Shipment) => Shipment) => update(current => ({ ...current, shipments: current.shipments.map(s => s.id === id ? fn(s) : s) }));
  async function openFile(file?: File) {
    if (!file) return;
    setImportError(""); setPreview(null);
    try { setPreview(parseShipmentWorkbook(await file.arrayBuffer())); }
    catch (error) { setImportError(error instanceof Error ? error.message : "Could not read this file."); }
  }
  const counts = { attention: data.shipments.filter(s => alertReasons(s, data.settings, today).length).length, active: data.shipments.filter(s => s.stage !== "delivered").length, delivered: data.shipments.filter(s => s.stage === "delivered").length };
  return <div className="flex flex-col gap-5">
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[15px] font-semibold">Shipment tracking</h2><p className="mt-1 text-[13px] text-sub">Import your Excel file. Tracking refreshes while the app is open and online.</p></div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-page"><FileUp className="size-4"/> Import Excel<input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ""; }}/></label></div>
      {importError && <p role="alert" className="mt-3 text-[13px] text-red">{importError}</p>}
    </Card>
    {preview && <Card className="px-5 py-4"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">Review import</h2><p className="mt-1 text-[13px] text-sub">{newRows.length} new · {preview.shipments.length - newRows.length} already imported · {preview.issues.length} skipped. Check warnings before importing.</p></div><Button size="sm" onClick={() => setPreview(null)}>Cancel</Button></div>
      <div className="mt-3 max-h-80 overflow-auto rounded-lg bg-fill p-3 text-[12px]">{preview.shipments.map((s, i) => <div key={`${s.source.sheet}-${s.source.row}`} className="border-b border-line py-2 last:border-0"><div className="flex flex-wrap items-center gap-2"><b>{s.name || "Name missing"}</b><span>{s.trackingNumber}</span><span className="text-sub">{s.shop || "No shop"} · {s.source.sheet}, row {s.source.row}</span>{known.has(s.trackingNumber.toUpperCase()) && <span>Already imported</span>}</div>
        <div className="mt-1 flex flex-wrap gap-2"><label>Carrier <input aria-label={`Carrier for row ${s.source.row}`} className="w-28 rounded bg-card px-2 py-1" value={s.carrier} onChange={e => setPreview({ ...preview, shipments: preview.shipments.map((row, j) => j === i ? { ...row, carrier: e.target.value } : row) })}/></label><label>Sent <input aria-label={`Date for row ${s.source.row}`} type="date" className="rounded bg-card px-2 py-1" value={s.shippedDate} onChange={e => setPreview({ ...preview, shipments: preview.shipments.map((row, j) => j === i ? { ...row, shippedDate: e.target.value } : row) })}/></label></div>
        {s.warnings.length > 0 && <p className="mt-1 text-orange">{s.warnings.join(" ")}</p>}</div>)}{preview.issues.map((issue, i) => <p key={i} className="py-1 text-red">{issue.source.sheet}, row {issue.source.row}: {issue.reason}</p>)}</div>
      <Button className="mt-3" variant="primary" disabled={!newRows.length} onClick={() => { const additions = newRows.map(fromImport); update(current => { const existing = new Set(current.shipments.map(s => s.trackingNumber.toUpperCase())); return { ...current, shipments: [...current.shipments, ...additions.filter(s => !existing.has(s.trackingNumber.toUpperCase()))] }; }); setPreview(null); setFilter("all"); }}>Import {newRows.length} shipments</Button>
    </Card>}
    <div className="grid grid-cols-3 gap-3">{[["Need attention", counts.attention], ["Active", counts.active], ["Delivered", counts.delivered]].map(([title, count]) => <Card key={String(title)} className="px-5 py-4"><p className="text-[12px] text-sub">{title}</p><p className="mt-1 text-[23px] font-semibold">{count}</p></Card>)}</div>
    <Card className="overflow-hidden"><div className="flex flex-wrap gap-2 border-b border-line p-4"><input aria-label="Search shipments" placeholder="Search customer, tracking number or shop" value={query} onChange={e => setQuery(e.target.value)} className="h-9 min-w-60 flex-1 rounded-lg bg-fill px-3 text-[13px] outline-none focus:ring-2 focus:ring-accent"/><select aria-label="Filter shipments" value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-lg bg-fill px-3 text-[13px]"><option value="attention">Need attention</option><option value="all">All shipments</option>{Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {list.length === 0 ? <Empty title={data.shipments.length ? "No shipments in this view" : "No shipments yet"} hint={data.shipments.length ? "Try another filter or search." : "Import an Excel file to get started."}/> : <div className="divide-y divide-line">{list.map(s => { const reasons = alertReasons(s, data.settings, today); return <button key={s.id} onClick={() => { setSelected(s.id); setNote(s.note); }} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-fill/50"><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{s.name || "Name missing"} <span className="font-normal text-sub">{s.shop && `· ${s.shop}`}</span></p><p className="mt-0.5 text-[12px] text-sub">{s.trackingNumber} · {s.service || s.carrier || "Carrier unknown"}</p>{reasons.length > 0 && <p className="mt-1 text-[12px] text-red">{reasons.join(" · ")}</p>}</div><Pill tone={s.stage === "delivered" ? "green" : reasons.length ? "red" : "neutral"}>{STAGES[s.stage] ?? "Not confirmed"}</Pill></button>; })}</div>}
    </Card>
    {notice && <p role="status" className="text-[13px] text-sub">{notice}</p>}
    {opened && <div className="fixed inset-0 z-40 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label="Shipment details"><div className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-pop"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{opened.name || "Name missing"}</h2><p className="text-[13px] text-sub">{opened.shop} · {opened.trackingNumber}</p></div><Button size="sm" onClick={() => setSelected(null)}><X className="size-4"/> Close</Button></div>
      <div className="mt-5 flex items-center gap-3"><Pill tone={opened.stage === "delivered" ? "green" : "accent"}>{STAGES[opened.stage]}</Pill><Button size="sm" disabled={!!checking} onClick={() => void refresh(opened)}><RefreshCw className="size-3.5"/>{checking === opened.id ? "Checking…" : "Check now"}</Button></div>
      <p className="mt-3 text-[12px] text-sub">{opened.lastChecked ? `Last checked: ${new Date(opened.lastChecked).toLocaleString()}` : "Not checked yet"}{opened.sourceName ? ` · Source: ${opened.sourceName}` : ""}</p>{opened.lastError && <p className="mt-2 text-[13px] text-red">{opened.lastError}</p>}
      <div className="mt-5 rounded-xl bg-fill p-4 text-[13px]"><p>{opened.address}</p><p>{[opened.city, opened.state, opened.postcode, opened.country].filter(Boolean).join(", ")}</p><p className="mt-2 text-sub">{opened.service || opened.carrier || "Carrier unknown"}{opened.awb ? ` · AWB ${opened.awb}` : ""}{opened.shippedDate ? ` · Sent ${opened.shippedDate}` : ""}</p></div>
      <h3 className="mt-5 text-[14px] font-semibold">Follow-up</h3><label className="mt-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={opened.issue} onChange={e => updateOne(opened.id, s => ({ ...s, issue: e.target.checked }))}/> Keep this shipment for an open issue</label><textarea aria-label="Follow-up note" value={note} onChange={e => setNote(e.target.value)} className="mt-2 min-h-20 w-full rounded-lg bg-fill p-3 text-[13px] outline-none focus:ring-2 focus:ring-accent" placeholder="Add a note about the delivery"/><Button size="sm" onClick={() => updateOne(opened.id, s => ({ ...s, note }))}>Save note</Button>
      <h3 className="mt-6 text-[14px] font-semibold">Tracking history</h3>{opened.events.length ? <div className="mt-2 divide-y divide-line">{opened.events.map((event, i) => <div key={i} className="py-2 text-[13px]"><p>{event.description}</p><p className="text-[12px] text-sub">{[event.time, event.location].filter(Boolean).join(" · ")}</p></div>)}</div> : <p className="mt-2 text-[13px] text-sub">No tracking scans available yet.</p>}
      <div className="mt-6"><ConfirmButton label="Delete shipment" confirmLabel="Confirm delete" variant="danger" onConfirm={() => { update(current => ({ ...current, shipments: current.shipments.filter(s => s.id !== opened.id) })); setSelected(null); }}/></div>
      </div></div>}
  </div>;
}

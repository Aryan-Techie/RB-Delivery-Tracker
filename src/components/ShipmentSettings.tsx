import { useState } from "react";
import { Button, Card } from "./ui";
import type { ShipmentSettings as Values } from "../lib/shipments";

const FIELDS: Array<{ key: keyof Values; label: string }> = [
  { key: "preTransitDays", label: "Pre-transit" },
  { key: "noScanDays", label: "No new tracking scan" },
  { key: "transitDays", label: "In transit" },
  { key: "outForDeliveryDays", label: "Out for delivery" },
];
export function ShipmentSettings({ settings, onSave }: { settings: Values; onSave: (s: Values) => void }) {
  const [values, setValues] = useState(settings);
  const valid = Object.values(values).every(n => Number.isInteger(n) && n >= 1 && n <= 180);
  const dirty = JSON.stringify(settings) !== JSON.stringify(values);
  return <Card className="px-5 py-4 lg:col-span-2">
    <h2 className="text-[15px] font-semibold">Shipment alerts</h2>
    <p className="mt-1 text-[13px] text-sub">Flag shipments after this many calendar days. These are review reminders, not delivery promises. Timing depends on available carrier scans.</p>
    <div className="mt-2 divide-y divide-line">{FIELDS.map(f => <label key={f.key} className="flex items-center justify-between gap-4 py-3">
      <span className="text-[14px]">{f.label}</span><span className="flex items-center gap-2"><input aria-label={f.label} type="number" min={1} max={180} value={values[f.key]} onChange={e => setValues({ ...values, [f.key]: Number(e.target.value) })} className="h-8 w-16 rounded-lg bg-fill px-2 text-center text-[14px] outline-none focus:ring-2 focus:ring-accent"/><span className="w-8 text-[13px] text-sub">days</span></span>
    </label>)}</div>
    {!valid && <p className="text-[12px] text-red">Use a whole number from 1 to 180.</p>}
    <Button className="mt-3" variant="primary" disabled={!valid || !dirty} onClick={() => onSave(values)}>Save shipment settings</Button>
  </Card>;
}

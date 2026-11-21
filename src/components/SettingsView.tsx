import { Download, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, shortDay } from "../lib/dates";
import { DAYS_MAX, DAYS_MIN, validDays, type Settings } from "../lib/model";
import { isDesktop, store } from "../lib/storage";
import { Button, Card } from "./ui";

function DaysField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="text-[14px]">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={DAYS_MIN}
          max={DAYS_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-8 w-16 rounded-lg bg-fill px-2 text-center text-[14px] font-medium outline-none focus:ring-2 focus:ring-accent"
        />
        <span className="w-8 text-[13px] text-sub">days</span>
      </span>
    </label>
  );
}

export function SettingsView({
  settings,
  today,
  ringCount,
  onSave,
  onExport,
}: {
  settings: Settings;
  today: string;
  ringCount: number;
  onSave: (s: Settings) => void;
  onExport: () => void;
}) {
  const [name, setName] = useState(settings.businessName);
  const [newDays, setNewDays] = useState(String(settings.newDays));
  const [repairDays, setRepairDays] = useState(String(settings.repairDays));
  const [saved, setSaved] = useState(false);
  const [path, setPath] = useState("");

  useEffect(() => {
    store.dataPath().then(setPath, () => setPath(""));
  }, []);

  const n = Number(newDays);
  const r = Number(repairDays);
  const valid = validDays(n) && validDays(r);
  const dirty = name.trim() !== settings.businessName || n !== settings.newDays || r !== settings.repairDays;

  return (
    <div className="grid max-w-[880px] gap-5 lg:grid-cols-2">
      <Card className="px-5 py-4 lg:col-span-2">
        <h2 className="text-[15px] font-semibold">Due dates</h2>
        <p className="mt-1 text-[13px] text-sub">
          A number shows <b className="font-medium text-orange">Due today</b> on its due date and turns{" "}
          <b className="font-medium text-red">red</b> the day after, until it is marked received.
        </p>
        <div className="mt-2 divide-y divide-line">
          <DaysField label="New orders should come back within" value={newDays} onChange={setNewDays} />
          <DaysField label="Repairs should come back within" value={repairDays} onChange={setRepairDays} />
        </div>
        {valid ? (
          <p className="mt-1 text-[12.5px] text-faint">
            Sent today ({shortDay(today, today)}): a new order is due {shortDay(addDays(today, n), today)} and red from{" "}
            {shortDay(addDays(today, n + 1), today)}. A repair is due {shortDay(addDays(today, r), today)} and red from{" "}
            {shortDay(addDays(today, r + 1), today)}.
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-red">
            Use a whole number from {DAYS_MIN} to {DAYS_MAX}.
          </p>
        )}
      </Card>

      <Card className="px-5 py-4">
        <h2 className="text-[15px] font-semibold">Your business</h2>
        <label className="mt-3 block">
          <span className="text-[13px] text-sub">Name shown at the top</span>
          <input
            value={name}
            maxLength={60}
            placeholder="e.g. Kanishka Jewels"
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg bg-fill px-3 text-[14px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
          />
        </label>
      </Card>

      <Card className="px-5 py-4">
        <h2 className="text-[15px] font-semibold">Your data</h2>
        <p className="mt-1 text-[13px] text-sub">
          {ringCount} {ringCount === 1 ? "number" : "numbers"} stored on this computer only. A backup copy is made every day
          (the last 60 days are kept).
        </p>
        {path && <p className="selectable mt-2 break-all font-mono text-[11.5px] text-faint">{path}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onExport}>
            <Download className="size-4" aria-hidden /> Export to Excel
          </Button>
          {isDesktop && (
            <Button onClick={() => store.openDataFolder()}>
              <FolderOpen className="size-4" aria-hidden /> Open data folder
            </Button>
          )}
        </div>
      </Card>
      <div className="flex items-center gap-3 lg:col-span-2">
        <Button
          variant="primary"
          disabled={!valid || !dirty}
          onClick={() => {
            onSave({ businessName: name.trim(), newDays: n, repairDays: r });
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          }}
        >
          Save settings
        </Button>
        {saved && <span className="text-[13px] text-green">Saved</span>}
        {dirty && !saved && <span className="text-[13px] text-faint">Unsaved changes</span>}
      </div>
    </div>
  );
}

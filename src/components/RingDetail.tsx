import { Undo2, X } from "lucide-react";
import { useEffect } from "react";
import { shortDay, timeOf } from "../lib/dates";
import { lastStepLabel, viewRing, viewTrip, type Data } from "../lib/model";
import { Button, ConfirmButton, Pill, StatusText, cx } from "./ui";

/** Side panel with one number's full history and its actions. */
export function RingDetail({
  data,
  ringId,
  today,
  onClose,
  onReceive,
  onRepair,
  onUndoStep,
  onDelete,
}: {
  data: Data;
  ringId: string;
  today: string;
  onClose: () => void;
  onReceive: (id: string) => void;
  onRepair: (id: string) => void;
  onUndoStep: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const ring = data.rings.find((r) => r.id === ringId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!ring || ring.trips.length === 0) return null;

  const v = viewRing(ring, data.settings, today);
  const trips = ring.trips.map((_, i) => viewTrip(ring, i, data.settings, today)).reverse();
  const repairs = ring.trips.filter((t) => t.kind === "repair").length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`PDF ${ring.label}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/20" />
      <aside className="anim-slide relative flex h-full w-[420px] max-w-full flex-col bg-card shadow-pop">
        <header className="flex items-start gap-3 px-6 pb-4 pt-6">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-faint">PDF number</p>
            <h2 className="selectable mt-0.5 truncate font-mono text-[24px] font-semibold tracking-tight">{ring.label}</h2>
            <p className="mt-1 text-[12.5px] text-sub">
              Tracked as <span className="selectable font-mono">{ring.key}</span>
              {repairs > 0 && ` · ${repairs} ${repairs === 1 ? "repair" : "repairs"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 cursor-default place-items-center rounded-full bg-fill text-sub hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="mx-6 rounded-xl bg-fill/70 px-4 py-3">
          <div className="text-[13.5px]">
            <StatusText v={v} today={today} />
          </div>
          <p className="mt-1 text-[12.5px] text-sub">
            {v.out
              ? `${v.trip.kind === "repair" ? "Repair" : "Sent"} ${shortDay(v.sentDay, today)} · due ${shortDay(v.dueDay, today)}`
              : `Last trip took ${v.days} ${v.days === 1 ? "day" : "days"}`}
          </p>
          <div className="mt-3">
            {v.out ? (
              <ConfirmButton size="md" label="Mark received today" confirmLabel="Confirm received" onConfirm={() => onReceive(ring.id)} />
            ) : (
              <ConfirmButton size="md" label="Send for repair today" confirmLabel="Confirm repair" onConfirm={() => onRepair(ring.id)} />
            )}
          </div>
        </div>

        <h3 className="px-6 pb-2 pt-6 text-[13px] font-semibold">History</h3>
        <ol className="flex-1 overflow-y-auto px-6">
          {trips.map((t, i) => (
            <li key={i} className="relative border-l border-line pb-5 pl-5 last:pb-2">
              <span
                className={cx(
                  "absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-card",
                  t.level === "late" ? "bg-red-dot" : t.out ? "bg-orange-dot" : "bg-green-dot",
                )}
              />
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium">{t.trip.kind === "new" ? "First trip" : `Repair ${t.repairNo}`}</span>
                {t.level === "late" && <Pill tone="red">{t.out ? "Late" : `${t.lateBy}d late`}</Pill>}
              </div>
              <dl className="mt-1 grid grid-cols-[72px_1fr] gap-y-0.5 text-[12.5px]">
                <dt className="text-faint">Sent</dt>
                <dd className="tabular text-sub">
                  {shortDay(t.sentDay, today)} · {timeOf(t.trip.sentAt)}
                </dd>
                <dt className="text-faint">Due</dt>
                <dd className="tabular text-sub">
                  {shortDay(t.dueDay, today)} ({t.allowed} days)
                </dd>
                <dt className="text-faint">Received</dt>
                <dd className="tabular text-sub">
                  {t.trip.receivedAt
                    ? `${shortDay(t.receivedDay!, today)} · ${timeOf(t.trip.receivedAt)} · ${t.days} ${t.days === 1 ? "day" : "days"}`
                    : "Not yet"}
                </dd>
              </dl>
            </li>
          ))}
        </ol>

        <footer className="flex items-center gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => onUndoStep(ring.id)}>
            <Undo2 className="size-3.5" aria-hidden />
            {lastStepLabel(ring)}
          </Button>
          <span className="flex-1" />
          <ConfirmButton variant="danger" label="Delete number" confirmLabel="Delete for good" onConfirm={() => onDelete(ring.id)} />
        </footer>
      </aside>
    </div>
  );
}

import { relativeDay, shortDay } from "../lib/dates";
import type { RingView } from "../lib/model";
import { ConfirmButton, Empty, StatusText, TripTag, cx } from "./ui";

export interface RowActions {
  onOpen: (ringId: string) => void;
  onReceive: (ringId: string) => void;
  onRepair: (ringId: string) => void;
}

const GRID = "grid grid-cols-[minmax(140px,1.4fr)_minmax(80px,0.8fr)_minmax(96px,1fr)_minmax(96px,1fr)_minmax(150px,1.5fr)_136px] items-center gap-4";

/** Full-width list of rings with column headers. */
export function RingTable({
  rows,
  today,
  actions,
  empty,
  hideAction,
}: {
  rows: RingView[];
  today: string;
  actions: RowActions;
  empty: { title: string; hint?: string };
  hideAction?: boolean;
}) {
  if (rows.length === 0) return <Empty {...empty} />;
  return (
    <div role="table" className="text-[13.5px]">
      <div role="row" className={cx(GRID, "border-b border-line px-5 pb-2 pt-3 text-[12px] font-medium text-faint")}>
        <span role="columnheader">PDF number</span>
        <span role="columnheader">Trip</span>
        <span role="columnheader">Sent</span>
        <span role="columnheader">Due</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="sr-only">
          Action
        </span>
      </div>
      {rows.map((v) => (
        <div
          role="row"
          key={v.ring.id}
          onClick={() => actions.onOpen(v.ring.id)}
          className={cx(GRID, "group border-b border-line px-5 py-2.5 last:border-b-0 hover:bg-fill/60")}
        >
          <span role="cell" className="truncate font-mono text-[14px] font-semibold tracking-tight" title={v.ring.label}>
            {v.ring.label}
          </span>
          <span role="cell">
            <TripTag v={v} />
          </span>
          <span role="cell" className="tabular text-sub">
            {relativeDay(v.sentDay, today)}
          </span>
          <span role="cell" className={cx("tabular", v.out && v.level === "late" ? "text-red" : "text-sub")}>
            {v.out ? relativeDay(v.dueDay, today) : shortDay(v.dueDay, today)}
          </span>
          <span role="cell">
            <StatusText v={v} today={today} />
          </span>
          <span role="cell" className="flex justify-end">
            {!hideAction &&
              (v.out ? (
                <ConfirmButton label="Received" confirmLabel="Confirm" onConfirm={() => actions.onReceive(v.ring.id)} />
              ) : (
                <ConfirmButton label="Send for repair" confirmLabel="Confirm" onConfirm={() => actions.onRepair(v.ring.id)} />
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact list for the Today cards: number, trip, one status line, action. */
export function CompactList({
  rows,
  today,
  actions,
  empty,
  detail,
}: {
  rows: RingView[];
  today: string;
  actions: RowActions;
  empty: string;
  detail: (v: RingView) => React.ReactNode;
}) {
  if (rows.length === 0) return <p className="px-5 py-6 text-[13px] text-faint">{empty}</p>;
  return (
    <ul className="max-h-[340px] overflow-y-auto">
      {rows.map((v) => (
        <li
          key={v.ring.id}
          onClick={() => actions.onOpen(v.ring.id)}
          className="flex items-center gap-3 border-t border-line px-5 py-2.5 first:border-t-0 hover:bg-fill/60"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-mono text-[14px] font-semibold tracking-tight">{v.ring.label}</span>
              {v.trip.kind === "repair" && <TripTag v={v} />}
            </span>
            <span className="mt-0.5 block text-[12.5px] text-sub">{detail(v)}</span>
          </span>
          {v.out ? (
            <ConfirmButton label="Received" onConfirm={() => actions.onReceive(v.ring.id)} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

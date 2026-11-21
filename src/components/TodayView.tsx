import { daysBetween, plural, shortDay, timeOf } from "../lib/dates";
import type { Summary } from "../lib/model";
import { CompactList, type RowActions } from "./RingTable";
import type { View } from "./Sidebar";
import { Card, cx } from "./ui";

const TONE_TEXT = { red: "text-red", orange: "text-orange", green: "text-green", repair: "text-repair" } as const;

function Tile({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "red" | "orange" | "green" | "repair";
  onClick: () => void;
}) {
  const color = value === 0 || !tone ? "text-ink" : TONE_TEXT[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-default rounded-2xl bg-card px-5 py-4 text-left shadow-card transition-transform hover:-translate-y-px"
    >
      <span className="block text-[13px] font-medium text-sub">{label}</span>
      <span className={cx("tabular mt-1 block text-[32px] font-semibold leading-none tracking-tight", color)}>{value}</span>
      <span className="mt-2 block text-[12px] text-faint">{hint}</span>
    </button>
  );
}

function Section({
  title,
  count,
  tone,
  children,
  onMore,
}: {
  title: string;
  count: number;
  tone?: "red" | "orange" | "green";
  children: React.ReactNode;
  onMore?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2 px-5 pb-2 pt-4">
        {tone && (
          <span
            aria-hidden
            className={cx(
              "size-2 rounded-full",
              tone === "red" ? "bg-red-dot" : tone === "orange" ? "bg-orange-dot" : "bg-green-dot",
            )}
          />
        )}
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="tabular text-[15px] font-semibold text-faint">{count}</span>
        <span className="flex-1" />
        {onMore && count > 0 && (
          <button type="button" onClick={onMore} className="cursor-default text-[12.5px] font-medium text-accent hover:underline">
            Show all
          </button>
        )}
      </header>
      {children}
    </Card>
  );
}

export function TodayView({
  summary,
  today,
  actions,
  onView,
}: {
  summary: Summary;
  today: string;
  actions: RowActions;
  onView: (v: View) => void;
}) {
  const { out, late, dueToday, repairsOut, backToday, sentToday } = summary;
  const repairsLate = repairsOut.filter((v) => v.level === "late").length;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-5 gap-4">
        <Tile label="At manufacturer" value={out.length} hint="Not back yet" onClick={() => onView("out")} />
        <Tile label="Late" value={late.length} tone="red" hint="Past the due date" onClick={() => onView("late")} />
        <Tile label="Due today" value={dueToday.length} tone="orange" hint="Should come back today" onClick={() => onView("out")} />
        <Tile label="Back today" value={backToday.length} tone="green" hint="Received today" onClick={() => onView("received")} />
        <Tile
          label="In repair"
          value={repairsOut.length}
          tone="repair"
          hint={repairsLate > 0 ? `${repairsLate} late` : "At manufacturer for repair"}
          onClick={() => onView("repairs")}
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Section title="Not back — late" count={late.length} tone="red" onMore={() => onView("late")}>
          <CompactList
            rows={late}
            today={today}
            actions={actions}
            empty="Nothing is late."
            detail={(v) => (
              <>
                <span className="font-medium text-red">{plural(v.lateBy, "day")} late</span> · due {shortDay(v.dueDay, today)} · sent{" "}
                {shortDay(v.sentDay, today)}
              </>
            )}
          />
        </Section>

        <Section title="Due today" count={dueToday.length} tone="orange">
          <CompactList
            rows={dueToday}
            today={today}
            actions={actions}
            empty="Nothing else is due today."
            detail={(v) => <>Sent {shortDay(v.sentDay, today)} · {plural(v.days, "day")} ago</>}
          />
        </Section>

        <Section title="Came back today" count={backToday.length} tone="green" onMore={() => onView("received")}>
          <CompactList
            rows={backToday}
            today={today}
            actions={actions}
            empty="Nothing received yet today."
            detail={(v) => (
              <>
                {timeOf(v.trip.receivedAt!)} · took {plural(v.days, "day")}
                {v.level === "late" ? <span className="text-red"> · {v.lateBy}d late</span> : " · on time"}
              </>
            )}
          />
        </Section>

        <Section title="Sent today" count={sentToday.length}>
          <CompactList
            rows={sentToday}
            today={today}
            actions={actions}
            empty="Nothing sent today."
            detail={(v) => <>Due {shortDay(v.dueDay, today)} · in {plural(daysBetween(today, v.dueDay), "day")}</>}
          />
        </Section>
      </div>
    </div>
  );
}

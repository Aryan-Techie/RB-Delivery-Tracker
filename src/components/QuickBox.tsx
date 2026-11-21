import { ArrowRight, CalendarDays, CornerDownLeft, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { addDays, daysBetween, dayOf, relativeDay, shortDay } from "../lib/dates";
import { countPlan, isAction, plan, type Data, type Mode, type PlanRow } from "../lib/model";
import { Button, Card, Pill, Segmented, cx } from "./ui";

export interface QuickBoxHandle {
  focus: () => void;
}

const MODES: Array<{ value: Mode; label: string; title: string }> = [
  { value: "auto", label: "Auto", title: "New numbers are sent, numbers at the manufacturer are received, received numbers go for repair" },
  { value: "send", label: "Send", title: "Only send: new numbers, or repairs of received numbers" },
  { value: "receive", label: "Received", title: "Only mark numbers as received back" },
];

function ActionPill({ row, data, day, today }: { row: PlanRow; data: Data; day: string; today: string }) {
  switch (row.kind) {
    case "send_new":
      return (
        <Pill tone="accent">
          Send · due {relativeDay(addDays(day, data.settings.newDays), today)}
        </Pill>
      );
    case "send_repair":
      return (
        <Pill tone="repair">
          Send for repair · due {relativeDay(addDays(day, data.settings.repairDays), today)}
        </Pill>
      );
    case "receive": {
      const ring = data.rings.find((r) => r.id === row.ringId);
      const last = ring?.trips[ring.trips.length - 1];
      const took = last ? daysBetween(dayOf(last.sentAt), day) : 0;
      return <Pill tone="green">Received · {took === 0 ? "same day" : took === 1 ? "after 1 day" : `after ${took} days`}</Pill>;
    }
    case "skip":
      return <Pill>{row.reason}</Pill>;
    default:
      return <Pill tone="red">{row.reason}</Pill>;
  }
}

/**
 * The one place where numbers come in: type one and press Enter, or paste a
 * whole column from Excel. A live preview shows what will happen to each number
 * before anything is saved.
 */
export const QuickBox = forwardRef<QuickBoxHandle, { data: Data; today: string; onApply: (rows: PlanRow[], day: string) => void }>(
  function QuickBox({ data, today, onApply }, ref) {
    const [text, setText] = useState("");
    const [mode, setMode] = useState<Mode>("auto");
    const [day, setDay] = useState<string | null>(null); // null = today
    const input = useRef<HTMLTextAreaElement>(null);
    const dateInput = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

    const actionDay = day && day <= today ? day : today;
    const rows = useMemo(() => (text.trim() ? plan(text, data, mode, actionDay) : []), [text, data, mode, actionDay]);
    const counts = countPlan(rows);
    const actionable = counts.send_new + counts.send_repair + counts.receive;

    function apply() {
      if (actionable === 0) return;
      onApply(rows, actionDay);
      setText("");
      setDay(null);
      input.current?.focus();
    }

    const lines = Math.min(6, Math.max(1, text.split("\n").length));
    const summary = [
      counts.send_new && `${counts.send_new} to send`,
      counts.send_repair && `${counts.send_repair} for repair`,
      counts.receive && `${counts.receive} received`,
      counts.skip && `${counts.skip} skipped`,
      counts.error && `${counts.error} with a problem`,
    ].filter(Boolean);

    return (
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 p-3 pl-4">
          <textarea
            ref={input}
            autoFocus
            value={text}
            rows={lines}
            spellCheck={false}
            aria-label="PDF numbers"
            placeholder="Type or paste PDF numbers — one or a whole column from Excel"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                apply();
              } else if (e.key === "Escape") {
                setText("");
              }
            }}
            className="min-h-9 flex-1 resize-none bg-transparent focus-visible:outline-none py-1.5 font-mono text-[15px] leading-6 tracking-tight text-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:tracking-normal placeholder:text-faint"
          />
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <Segmented label="What to do" value={mode} options={MODES} onChange={setMode} />
            <div className="relative">
              <button
                type="button"
                onClick={() => dateInput.current?.showPicker()}
                className={cx(
                  "flex h-8 cursor-default items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium",
                  day && day !== today ? "bg-orange-bg text-orange" : "bg-fill text-sub hover:text-ink",
                )}
                title="Date of this action. Pick an earlier day to record something that happened before."
              >
                <CalendarDays className="size-3.5" aria-hidden />
                {day && day !== today ? shortDay(day, today) : "Today"}
              </button>
              <input
                ref={dateInput}
                type="date"
                tabIndex={-1}
                aria-label="Date"
                value={actionDay}
                max={today}
                onChange={(e) => setDay(e.target.value || null)}
                className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
              />
            </div>
            {day && day !== today && (
              <button
                type="button"
                onClick={() => setDay(null)}
                title="Back to today"
                className="-ml-1 grid size-6 cursor-default place-items-center rounded-full text-faint hover:bg-fill hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>

        {rows.length > 0 && (
          <div className="anim-rise border-t border-line">
            <ul className="max-h-[260px] overflow-y-auto py-1">
              {rows.map((r, i) => (
                <li
                  key={`${r.label}-${i}`}
                  className={cx("flex items-center gap-3 px-4 py-1.5 text-[13.5px]", !isAction(r.kind) && "opacity-70")}
                >
                  <span className="w-44 truncate font-mono font-semibold tracking-tight">{r.label}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-faint" aria-hidden />
                  <ActionPill row={r} data={data} day={actionDay} today={today} />
                  {r.existingLabel && <span className="truncate text-[12.5px] text-faint">matches {r.existingLabel}</span>}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 border-t border-line bg-fill/50 px-4 py-2.5">
              <span className="flex-1 text-[13px] text-sub">{summary.join(" · ")}</span>
              <Button variant="ghost" size="sm" onClick={() => setText("")}>
                <X className="size-3.5" aria-hidden /> Clear
              </Button>
              <Button variant="primary" size="sm" disabled={actionable === 0} onClick={apply}>
                {actionable === 0 ? "Nothing to save" : `Save ${actionable}`}
                <CornerDownLeft className="size-3.5 opacity-60" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  },
);

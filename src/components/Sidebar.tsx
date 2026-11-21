import { AlarmClock, CircleCheck, Gem, LayoutList, PackageSearch, Settings, Sun, Truck, Wrench, type LucideIcon } from "lucide-react";
import { cx } from "./ui";

export type View = "today" | "out" | "late" | "repairs" | "received" | "all" | "shipments" | "settings";

export const VIEW_TITLES: Record<View, string> = {
  today: "Today",
  out: "At manufacturer",
  late: "Late",
  repairs: "Repairs",
  received: "Received",
  all: "All orders",
  shipments: "Shipments",
  settings: "Settings",
};

const ITEMS: Array<{ view: View; icon: LucideIcon }> = [
  { view: "today", icon: Sun },
  { view: "out", icon: Truck },
  { view: "late", icon: AlarmClock },
  { view: "repairs", icon: Wrench },
  { view: "received", icon: CircleCheck },
  { view: "all", icon: LayoutList },
  { view: "shipments", icon: PackageSearch },
];

export function Sidebar({
  view,
  onView,
  counts,
  businessName,
  saveState,
}: {
  view: View;
  onView: (v: View) => void;
  counts: Partial<Record<View, number>>;
  businessName: string;
  saveState: "saved" | "saving" | "error";
}) {
  const item = (v: View, Icon: LucideIcon) => {
    const active = view === v;
    const count = counts[v];
    const alert = v === "late" && (count ?? 0) > 0;
    return (
      <button
        key={v}
        type="button"
        onClick={() => onView(v)}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex h-8 w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
          active ? "bg-card font-medium text-ink shadow-card" : "text-ink/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
        )}
      >
        <Icon className={cx("size-4 shrink-0", alert ? "text-red" : active ? "text-accent" : "text-sub")} aria-hidden />
        <span className="flex-1 text-left">{VIEW_TITLES[v]}</span>
        {count !== undefined && count > 0 && (
          <span
            className={cx(
              "tabular min-w-5 rounded-full px-1.5 text-center text-[11.5px] font-semibold",
              alert ? "bg-red-dot text-white" : "text-faint",
            )}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav aria-label="Sections" className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar px-3 pb-3 pt-5">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-ink text-page">
          <Gem className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-tight">RB Tracker</span>
          <span className="block truncate text-[12px] text-sub">{businessName || "Manufacturer tracking"}</span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5">{ITEMS.map((i) => item(i.view, i.icon))}</div>
      <div className="flex-1" />
      {item("settings", Settings)}
      <p
        className={cx(
          "mt-3 flex items-center gap-1.5 px-2.5 text-[11.5px]",
          saveState === "error" ? "font-medium text-red" : "text-faint",
        )}
        role="status"
      >
        <span
          className={cx(
            "size-1.5 rounded-full",
            saveState === "error" ? "bg-red-dot" : saveState === "saving" ? "bg-orange-dot" : "bg-green-dot",
          )}
        />
        {saveState === "error" ? "Could not save" : saveState === "saving" ? "Saving…" : "Saved on this computer"}
      </p>
    </nav>
  );
}

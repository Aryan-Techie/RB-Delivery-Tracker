import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuickBox, type QuickBoxHandle } from "./components/QuickBox";
import { RingDetail } from "./components/RingDetail";
import { RingTable, type RowActions } from "./components/RingTable";
import { SettingsView } from "./components/SettingsView";
import { ShipmentSettings } from "./components/ShipmentSettings";
import { ShipmentsView } from "./components/ShipmentsView";
import { Sidebar, VIEW_TITLES, type View } from "./components/Sidebar";
import { TodayView } from "./components/TodayView";
import { Card, cx } from "./components/ui";
import { csvFileName, toCsv } from "./lib/csv";
import { dayOf, instantOn, longDay, plural, relativeDay } from "./lib/dates";
import {
  applyPlan,
  byRecent,
  countPlan,
  deleteRing,
  matchesSearch,
  receiveRing,
  sendForRepair,
  summarize,
  undoLastStep,
  viewAll,
  type Data,
  type PlanRow,
  type RingView,
  type Settings,
} from "./lib/model";
import { loadData, saveData, store } from "./lib/storage";
import { useShipmentStore } from "./lib/shipment-store";
import { purgeDelivered } from "./lib/shipments";
import { useTracking } from "./lib/use-tracking";

/** Ticking clock so the colours roll over at midnight without a restart. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    const onFocus = () => setNow(new Date());
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
  return now;
}

interface Toast {
  id: number;
  text: string;
  undo?: Data;
}

function groupByDay(rows: RingView[]): Array<{ day: string; rows: RingView[] }> {
  const groups = new Map<string, RingView[]>();
  for (const v of rows) {
    const d = v.receivedDay!;
    groups.set(d, [...(groups.get(d) ?? []), v]);
  }
  return [...groups.entries()].map(([day, rows]) => ({ day, rows }));
}

export default function App() {
  const now = useNow();
  const today = dayOf(now);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [view, setView] = useState<View>("today");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const quick = useRef<QuickBoxHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const shipmentStore = useShipmentStore();
  const tracking = useTracking(shipmentStore.data, shipmentStore.update);

  useEffect(() => {
    if (shipmentStore.data && purgeDelivered(shipmentStore.data, today) !== shipmentStore.data) {
      shipmentStore.update(current => purgeDelivered(current, today));
    }
  }, [shipmentStore.data, shipmentStore.update, today]);

  useEffect(() => {
    loadData().then(
      ({ data, notice }) => {
        setData(data);
        if (notice) setToast({ id: Date.now(), text: notice });
      },
      (err) => setLoadError(String(err?.message ?? err)),
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undo ? 9000 : 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Every change goes through here: update the screen, then write the file (in order). */
  const commit = useCallback((next: Data, message?: string, undo?: Data) => {
    setData(next);
    setSaveState("saving");
    saveChain.current = saveChain.current
      .then(() => saveData(next))
      .then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    if (message) setToast({ id: Date.now(), text: message, undo });
  }, []);

  const views = useMemo(() => (data ? viewAll(data, today) : []), [data, today]);
  const summary = useMemo(() => summarize(views, today), [views, today]);

  if (loadError) {
    return (
      <div className="grid h-full place-items-center p-10">
        <Card className="max-w-md px-6 py-5">
          <h1 className="text-[16px] font-semibold">The data file could not be opened</h1>
          <p className="mt-2 text-[13px] text-sub">{loadError}</p>
          <p className="mt-2 text-[13px] text-sub">Nothing was changed. Close the app and contact support with this message.</p>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  const at = () => new Date().toISOString();
  const labelOf = (id: string) => data.rings.find((r) => r.id === id)?.label ?? "";

  const actions: RowActions = {
    onOpen: setOpenId,
    onReceive: (id) => commit(receiveRing(data, id, at()), `${labelOf(id)} marked received`, data),
    onRepair: (id) => commit(sendForRepair(data, id, at()), `${labelOf(id)} sent for repair`, data),
  };

  function onApply(rows: PlanRow[], day: string) {
    if (!data) return;
    const c = countPlan(rows);
    const parts = [
      c.send_new && `${c.send_new} sent`,
      c.send_repair && `${c.send_repair} sent for repair`,
      c.receive && `${c.receive} received`,
    ].filter(Boolean);
    const when = day === today ? "" : ` (${relativeDay(day, today)})`;
    commit(applyPlan(data, rows, instantOn(day, new Date())), `${parts.join(" · ")}${when}`, data);
  }

  function onSaveSettings(s: Settings) {
    if (data) commit({ ...data, settings: s });
  }

  async function onExport() {
    if (!data) return;
    const ok = await store.exportCsv(csvFileName(today), toCsv(data, today));
    if (ok) setToast({ id: Date.now(), text: "Exported for Excel" });
  }

  const counts: Partial<Record<View, number>> = {
    out: summary.out.length,
    late: summary.late.length,
    repairs: summary.repairsOut.length,
  };

  const searching = query.trim().length > 0 && view !== "settings" && view !== "shipments";
  const results = searching ? views.filter((v) => matchesSearch(v, query)).sort(byRecent) : [];

  let body: React.ReactNode;
  if (searching) {
    body = (
      <Card className="overflow-hidden">
        <RingTable
          rows={results}
          today={today}
          actions={actions}
          empty={{ title: `No number matches “${query.trim()}”`, hint: "Search by the full PDF number or just its digits." }}
        />
      </Card>
    );
  } else if (view === "today") {
    body = <TodayView summary={summary} today={today} actions={actions} onView={setView} />;
  } else if (view === "settings") {
    body = (
      <div className="flex flex-col gap-5">
      <SettingsView
        key={JSON.stringify(data.settings)}
        settings={data.settings}
        today={today}
        ringCount={data.rings.length}
        onSave={onSaveSettings}
        onExport={onExport}
      />
      {shipmentStore.data && <div className="max-w-[880px]"><ShipmentSettings key={JSON.stringify(shipmentStore.data.settings)} settings={shipmentStore.data.settings} onSave={settings => shipmentStore.update(current => ({ ...current, settings }))}/></div>}
      {shipmentStore.error && <p role="alert" className="text-[13px] text-red">{shipmentStore.error}</p>}
      </div>
    );
  } else if (view === "shipments") {
    body = shipmentStore.data ? <><ShipmentsView data={shipmentStore.data} update={shipmentStore.update} today={today} checking={tracking.checking} notice={tracking.notice} refresh={tracking.refresh}/>{shipmentStore.error && <p role="alert" className="mt-3 text-[13px] text-red">{shipmentStore.error}</p>}</> : <Card className="p-5 text-[13px] text-red">{shipmentStore.error || "Loading shipments…"}</Card>;
  } else if (view === "received") {
    const groups = groupByDay(summary.back);
    body =
      groups.length === 0 ? (
        <Card>
          <RingTable rows={[]} today={today} actions={actions} empty={{ title: "Nothing has come back yet" }} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h2 className="mb-2 px-1 text-[13px] font-semibold text-sub">
                {relativeDay(g.day, today)} <span className="font-normal text-faint">· {g.rows.length}</span>
              </h2>
              <Card className="overflow-hidden">
                <RingTable rows={g.rows} today={today} actions={actions} empty={{ title: "" }} />
              </Card>
            </div>
          ))}
        </div>
      );
  } else if (view === "repairs") {
    const backFromRepair = summary.back.filter((v) => v.trip.kind === "repair");
    body = (
      <div className="flex flex-col gap-5">
        <Card className="overflow-hidden">
          <h2 className="px-5 pt-4 text-[15px] font-semibold">
            At manufacturer for repair <span className="text-faint">{summary.repairsOut.length}</span>
          </h2>
          <RingTable
            rows={summary.repairsOut}
            today={today}
            actions={actions}
            empty={{ title: "No repairs at the manufacturer", hint: `A repair is due ${plural(data.settings.repairDays, "day")} after it is sent.` }}
          />
        </Card>
        {backFromRepair.length > 0 && (
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 text-[15px] font-semibold">
              Back from repair <span className="text-faint">{backFromRepair.length}</span>
            </h2>
            <RingTable rows={backFromRepair} today={today} actions={actions} empty={{ title: "" }} />
          </Card>
        )}
      </div>
    );
  } else {
    const rows = view === "out" ? summary.out : view === "late" ? summary.late : [...views].sort(byRecent);
    const empty =
      view === "late"
        ? { title: "Nothing is late", hint: "Numbers turn red the day after their due date." }
        : view === "out"
          ? { title: "Nothing is at the manufacturer", hint: "Paste PDF numbers above to start tracking." }
          : { title: "No orders yet", hint: "Paste PDF numbers above to start tracking." };
    body = (
      <Card className="overflow-hidden">
        <RingTable rows={rows} today={today} actions={actions} empty={empty} />
      </Card>
    );
  }

  const subtitle =
    view === "today"
      ? longDay(today)
      : view === "out"
        ? `${plural(summary.out.length, "number")} not back yet`
        : view === "late"
          ? `${plural(summary.late.length, "number")} past the due date`
          : view === "repairs"
            ? `Due ${plural(data.settings.repairDays, "day")} after sending`
            : view === "received"
              ? `${plural(summary.back.length, "number")} back from the manufacturer`
              : view === "all"
                ? `${plural(views.length, "number")} in total`
                : "";

  return (
    <div className="flex h-full">
      <Sidebar
        view={view}
        onView={(v) => {
          setView(v);
          setQuery("");
        }}
        counts={counts}
        businessName={data.settings.businessName}
        saveState={saveState}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-8 pb-16">
          <header className="sticky top-0 z-20 -mx-8 flex items-end gap-4 bg-page/85 px-8 pb-4 pt-6 backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
                {searching ? "Search" : VIEW_TITLES[view]}
              </h1>
              <p className="mt-0.5 text-[13px] text-sub">
                {searching ? `${plural(results.length, "match", "matches")}` : subtitle}
              </p>
            </div>
            {view !== "settings" && view !== "shipments" && (
              <label className="relative flex h-9 w-72 items-center rounded-lg bg-fill-strong/70 focus-within:ring-2 focus-within:ring-accent">
                <Search className="pointer-events-none absolute left-3 size-4 text-faint" aria-hidden />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                  placeholder="Search PDF number"
                  aria-label="Search PDF number"
                  className="h-full w-full bg-transparent pl-9 pr-8 text-[13.5px] outline-none placeholder:text-faint"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2 grid size-5 cursor-default place-items-center rounded-full bg-faint/40 text-card"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </label>
            )}
          </header>

          {view !== "settings" && view !== "shipments" && (
            <div className="mb-6">
              <QuickBox ref={quick} data={data} today={today} onApply={onApply} />
            </div>
          )}

          {body}
        </div>
      </main>

      {openId && (
        <RingDetail
          data={data}
          ringId={openId}
          today={today}
          onClose={() => setOpenId(null)}
          onReceive={actions.onReceive}
          onRepair={actions.onRepair}
          onUndoStep={(id) => {
            const next = undoLastStep(data, id);
            if (!next.rings.some((r) => r.id === id)) setOpenId(null);
            commit(next, `${labelOf(id)}: last step undone`, data);
          }}
          onDelete={(id) => {
            setOpenId(null);
            commit(deleteRing(data, id), `${labelOf(id)} deleted`, data);
          }}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="anim-rise fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-ink py-2 pl-5 pr-2 text-[13.5px] text-page shadow-pop"
        >
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                commit(toast.undo!, "Undone");
                setOpenId(null);
              }}
              className="cursor-default rounded-full bg-page/15 px-3 py-1 font-medium hover:bg-page/25"
            >
              Undo
            </button>
          ) : (
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className={cx("grid size-7 cursor-default place-items-center rounded-full hover:bg-page/15")}>
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

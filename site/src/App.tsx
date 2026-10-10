import { useEffect, useRef, useState } from "react";
import { BothTools, ContextCard, CostCard, MixCard, RateLimits, TokensCard, Trend } from "@/components/Charts";
import { Breadcrumb, DayView, MeasureSwitch, WeekList, WeekView } from "@/components/Drill";
import { Heatmap } from "@/components/Heatmap";
import { KpiRows } from "@/components/KpiCards";
import { NavProvider, useGo, useLocationSearch } from "@/components/Nav";
import { days, drillWeeks, href, parseView, type Nav } from "@/lib/drill";
import { cacheReadPct, heatmap, kpis, modelMix, parseWeeks, span, tokenRows, TOOL_NAMES, TOOLS, weekly, WHICH, type Measure, type Meta, type Row, type Week } from "@/lib/shape";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; meta: Meta; weeks: Week[] };

export default function App() {
  const [s, setS] = useState<State>({ status: "loading" });
  const [search, go] = useLocationSearch();
  useEffect(() => {
    const get = (p: string) => fetch(p).then((r) => {
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.text();
    });
    Promise.all([get("/data/meta.json"), get("/data/weeks.jsonl")])
      .then(([m, w]) => setS({ status: "ok", meta: JSON.parse(m), weeks: parseWeeks(w) }))
      .catch(() => setS({ status: "error" }));
  }, []);
  return (
    <NavProvider go={go}>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">AI usage: Claude Code and Codex</h1>
          {s.status === "ok" && (
            <p className="text-sm text-muted-foreground">
              Token use per week against the baseline ({s.meta.baseline.label}). Data as of {new Date(s.meta.generatedAt).toLocaleString()}.
            </p>
          )}
        </header>
        {s.status === "loading" && <p role="status">Loading usage data…</p>}
        {s.status === "error" && <p role="alert">Could not load usage data.</p>}
        {s.status === "ok" && <Routed meta={s.meta} weeks={s.weeks} nav={parseView(search, s.weeks)} />}
      </main>
    </NavProvider>
  );
}

function Routed({ meta, weeks, nav: { view, by, notice } }: { meta: Meta; weeks: Week[]; nav: Nav }) {
  const heading = useRef<HTMLHeadingElement>(null), shown = useRef<string | null>(null);
  const week = view.level === "overview" ? null : view.week.week;
  const day = view.level === "day" ? days(view.week).find((d) => d.date === view.day) ?? null : null;
  const key = `${week}/${day?.date}`;
  // After navigating to another view, move focus to its heading. Not on first load, and not when only the measure changes.
  useEffect(() => {
    if (shown.current !== null && shown.current !== key) heading.current?.focus();
    shown.current = key;
  }, [key]);
  const crumbs = week === null ? [] : [
    { label: "All weeks", to: href({ by }) },
    { label: week, to: href({ week, by }) },
    ...(day ? [{ label: day.label, to: href({ week, day: day.date, by }) }] : []),
  ];
  return (
    <>
      {crumbs.length > 0 && <Breadcrumb items={crumbs} />}
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">{day ? `${day.label}, ${week}` : week ?? "All weeks"}</h2>
      {notice && <p role="status" className="rounded-md border px-3 py-2 text-sm">{notice}</p>}
      {view.level === "overview" && <Overview meta={meta} weeks={weeks} by={by} />}
      {view.level === "week" && <WeekView weeks={weeks} w={view.week} by={by} />}
      {view.level === "day" && <DayView weeks={weeks} w={view.week} day={view.day} by={by} />}
    </>
  );
}

function Overview({ meta, weeks, by }: { meta: Meta; weeks: Week[]; by: Measure }) {
  const go = useGo(), k = kpis(weeks, meta), open = (r: Row) => go(href({ week: String(r.week), by }));
  return (
    <>
      <KpiRows k={k} />
      <div className="grid gap-6 lg:grid-cols-2">
        {TOOLS.map((t) => <Trend key={t} weeks={weeks} meta={meta} tool={t} kpi={k[t].find((x) => x.label === "Input per day")!} />)}
      </div>
      <BothTools weeks={weeks} />
      <MeasureSwitch by={by} to={(m) => href({ by: m })} />
      <div className="grid gap-6 lg:grid-cols-2">
        {WHICH.flatMap((which) => TOOLS.map((t) => {
          const mix = modelMix(weeks, t, by, which);
          return <MixCard key={t + which} tool={t} by={by} which={which} mix={mix} x="week" scope={`for ${span(mix.rows)}`} onSelect={open} />;
        }))}
        {TOOLS.map((t) => {
          const data = tokenRows(weeks, t), pct = cacheReadPct(weeks, t);
          const title = pct === null ? undefined : `${pct}% of ${TOOL_NAMES[t]} input is cache reads`;
          return <TokensCard key={t} tool={t} data={data} x="week" scope={`for ${span(data.rows)}`} title={title} onSelect={open} />;
        })}
        {TOOLS.map((t) => {
          const rows = weekly(weeks, t, "cost", (w) => w.costUSD);
          return <CostCard key={t} tool={t} rows={rows} x="week" scope={`for ${span(rows)}`} onSelect={open} />;
        })}
        {TOOLS.map((t) => <ContextCard key={t} weeks={weeks} tool={t} baseline={meta.baseline[t]?.peakContext ?? null} />)}
        <RateLimits weeks={weeks} />
      </div>
      <Heatmap grid={heatmap(weeks)} scope="summed over all complete weeks" />
      <WeekList weeks={drillWeeks(weeks)} by={by} />
    </>
  );
}

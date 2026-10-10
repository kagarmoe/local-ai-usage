import { useEffect, useState } from "react";
import { ModelMix, TokensChart, Trend } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { KpiCards } from "@/components/KpiCards";
import { kpis, parseWeeks, type Meta, type Tool, type Week } from "@/lib/shape";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; meta: Meta; weeks: Week[] };
const TOOLS: Tool[] = ["claudeCode", "codex"];

export default function App() {
  const [s, setS] = useState<State>({ status: "loading" });
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
      {s.status === "ok" && <Overview meta={s.meta} weeks={s.weeks} />}
    </main>
  );
}

function Overview({ meta, weeks }: { meta: Meta; weeks: Week[] }) {
  const k = kpis(weeks, meta);
  return (
    <>
      <KpiCards items={k} />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* k[0] and k[2] are the two tools' input-per-day cards. */}
        {TOOLS.map((t, i) => <Trend key={t} weeks={weeks} meta={meta} tool={t} kpi={k[i * 2]} />)}
        {TOOLS.map((t) => <TokensChart key={t} weeks={weeks} tool={t} />)}
        {TOOLS.map((t) => <ModelMix key={t} weeks={weeks} tool={t} />)}
      </div>
      <Heatmap weeks={weeks} />
    </>
  );
}

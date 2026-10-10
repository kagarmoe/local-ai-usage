import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { Section } from "@/components/Section";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  allInput, AXIS, bothRows, cell, changeText, CONTEXT_SERIES, contextRows, emptyText, eventMarkers, fmt, inputPerDay, MEASURE_UNIT, money, peakRow,
  RATE_SERIES, rateRows, span, TOOL_NAMES, TOOLS, topSeries, trendRows,
  type Kpi, type Measure, type Meta, type Row, type Series, type Tool, type Unit, type Week, type Which,
} from "@/lib/shape";

type X = "week" | "day" | "hour";
type Data = { series: Series; rows: Row[] };
type Select = (row: Row) => void;

const X_LABEL: Record<X, string> = { week: "Week", day: "Day", hour: "Hour" };
const AT: Record<X, string> = { week: "in", day: "on", hour: "at" };
const MEASURE_NOUN: Record<Measure, string> = { input: "input", cost: "cost", calls: "calls" };
const MEASURE_TEXT: Record<Measure, string> = { input: "input tokens", cost: "estimated cost at API list price", calls: "calls" };
const DASH = [undefined, "6 3", "2 3", "8 3 2 3"];
const LABEL = { fill: "var(--foreground)", fontSize: 12 };
const COST: Series = [{ key: "cost", label: "Estimated cost" }];

const config = (series: Series): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? `var(--chart-${i + 1})` }]));

const NoData = ({ text = "no data" }: { text?: string }) => <p className="py-16 text-center text-sm text-muted-foreground first-letter:uppercase">{text}</p>;

/** Stacked bars. Clicking a bar calls onSelect with its row. A legend only when there is more than one series. */
function Stacked({ rows, series, x, unit, onSelect }: Data & { x: X; unit: Unit; onSelect?: Select }) {
  return (
    <ChartContainer config={config(series)} className="h-64 w-full">
      <BarChart data={rows} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} tickLine={false} minTickGap={16} />
        <YAxis width={56} tickFormatter={AXIS[unit]} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={AXIS[unit]} />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Bar
            key={s.key} dataKey={s.key} stackId="a" fill={`var(--color-${s.key})`}
            className={onSelect ? "cursor-pointer" : undefined}
            // Recharts skips empty bars when numbering them, so take the row from the bar, not the index.
            onClick={onSelect ? (bar) => onSelect(bar.payload as Row) : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Lines over weeks, each with its own colour and dash. With several lines, each is labelled at its last point. */
function Lines({ rows, series, unit, yMax, children }: Data & { unit: Unit; yMax?: number | null; children?: ReactNode }) {
  const labelled = series.length > 1;
  return (
    <ChartContainer config={config(series)} className="h-64 w-full">
      <LineChart data={rows} accessibilityLayer margin={{ top: 5, right: labelled ? 64 : 16, bottom: 5, left: 5 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} minTickGap={16} />
        <YAxis width={56} tickFormatter={AXIS[unit]} domain={[0, (max: number) => Math.max(max, yMax ?? 0)]} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={AXIS[unit]} />} />
        {series.map((s, i) => (
          <Line key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} strokeDasharray={DASH[i % DASH.length]} />
        ))}
        {labelled && series.map((s) => {
          const last = rows.findLast((r) => typeof r[s.key] === "number");
          return last && (
            <ReferenceDot key={`label-${s.key}`} x={String(last.week)} y={last[s.key] as number} r={0} label={{ ...LABEL, value: s.label, position: "right" }} />
          );
        })}
        {children}
      </LineChart>
    </ChartContainer>
  );
}

/** Input per day for one tool against its baseline, with event markers. */
export function Trend({ weeks, tool, meta, kpi }: { weeks: Week[]; tool: Tool; meta: Meta; kpi: Kpi }) {
  const rows = trendRows(weeks, tool), name = TOOL_NAMES[tool], change = changeText(kpi.change, kpi.unit);
  return (
    <Section
      title={change ? `${name} input per day ${change}` : `${name} input per day`}
      summary={`Line chart of ${name} input tokens per day for ${span(rows)}. ${kpi.baseline === null ? "There is no baseline for this tool." : `The dashed line is the baseline, ${fmt(kpi.baseline)} tokens.`}`}
      columns={["Week", "Input per day"]}
      rows={rows.map((r) => [String(r.week), cell(r.inputPerDay)])}
    >
      <Lines rows={rows} series={[{ key: "inputPerDay", label: "Input per day" }]} unit="tokens" yMax={kpi.baseline}>
        {kpi.baseline !== null && (
          <ReferenceLine y={kpi.baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Baseline", position: "insideBottomLeft" }} />
        )}
        {eventMarkers(weeks, tool, meta.events).map((e) => (
          <ReferenceLine key={e.week + e.label} x={e.week} stroke="var(--foreground)" label={{ ...LABEL, value: e.label, position: "insideTopLeft" }} />
        ))}
      </Lines>
    </Section>
  );
}

/** Input per day for both tools on one scale, and weekly input stacked by tool. */
export function BothTools({ weeks }: { weeks: Week[] }) {
  const perDay = bothRows(weeks, inputPerDay), total = bothRows(weeks, (t) => allInput(t.tokens));
  const series: Series = TOOLS.map((t, i) => ({ key: t, label: TOOL_NAMES[t], color: `var(--chart-${i + 1})` }));
  const yMax = Math.max(0, ...perDay.flatMap((r) => TOOLS.map((t) => Number(r[t] ?? 0))));
  const last = total.at(-1), cc = Number(last?.claudeCode ?? 0), sum = cc + Number(last?.codex ?? 0);
  return (
    <Section
      title={last && sum ? `Claude Code had ${Math.round((cc / sum) * 100)}% of combined input in ${last.week}` : "Claude Code and Codex input: no data"}
      summary={`Input per day for each tool on one scale, and weekly input (cache included) stacked by tool, for ${span(total)}.`}
      columns={["Week", ...TOOLS.flatMap((t) => [`${TOOL_NAMES[t]} per day`, `${TOOL_NAMES[t]} per week`])]}
      rows={perDay.map((r, i) => [String(r.week), ...TOOLS.flatMap((t) => [cell(r[t]), cell(total[i][t])])])}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {series.map((s) => (
          <figure key={s.key}>
            <figcaption className="text-sm text-muted-foreground">{s.label} input per day</figcaption>
            <Lines rows={perDay} series={[s]} unit="tokens" yMax={yMax} />
          </figure>
        ))}
      </div>
      <Stacked rows={total} series={series} x="week" unit="tokens" />
    </Section>
  );
}

/** Tokens by type per period. The title names the busiest period unless the caller gives a finding. */
export function TokensCard({ tool, data, x, scope, title, note, onSelect }: {
  tool: Tool; data: Data; x: X; scope: string; title?: string; note?: string; onSelect?: Select;
}) {
  const name = TOOL_NAMES[tool], peak = peakRow(data.rows, data.series);
  return (
    <Section
      title={!peak ? `${name} tokens: ${emptyText(data.rows)}` : title ?? `${name}'s busiest ${x} was ${peak.row[x]}, ${fmt(peak.total)} tokens`}
      summary={`Stacked bar chart of ${name} tokens per ${x} by type, ${scope}.${note ? ` ${note}` : ""}`}
      columns={[X_LABEL[x], ...data.series.map((s) => s.label)]}
      rows={data.rows.map((r) => [String(r[x]), ...data.series.map((s) => cell(r[s.key]))])}
    >
      {peak ? <Stacked {...data} x={x} unit="tokens" onSelect={onSelect} /> : <NoData text={emptyText(data.rows)} />}
    </Section>
  );
}

/** Estimated cost per period at API list price. */
export function CostCard({ tool, rows, x, scope, onSelect }: { tool: Tool; rows: Row[]; x: X; scope: string; onSelect?: Select }) {
  const name = TOOL_NAMES[tool], peak = peakRow(rows, COST);
  return (
    <Section
      title={peak ? `${name} cost peaked at ${money(peak.total)} ${AT[x]} ${peak.row[x]} (estimate at API list price)` : `${name} cost: ${emptyText(rows)}`}
      summary={`Bar chart of ${name} cost per ${x} in US dollars, an estimate at API list price, ${scope}.${!peak && tool === "codex" ? " Codex has no prices yet, so there is no estimate." : ""}`}
      columns={[X_LABEL[x], "Estimated cost"]}
      rows={rows.map((r) => [String(r[x]), cell(r.cost, "$")])}
    >
      {peak ? <Stacked rows={rows} series={COST} x={x} unit="$" onSelect={onSelect} /> : <NoData text={emptyText(rows)} />}
    </Section>
  );
}

/** A model mix by the current measure, main thread or subagents. The title names the top model. */
export function MixCard({ tool, by, which, mix, x, scope, onSelect }: {
  tool: Tool; by: Measure; which: Which; mix: Data; x: X; scope: string; onSelect?: Select;
}) {
  const name = TOOL_NAMES[tool], thread = which === "models" ? "main-thread" : "subagent", top = topSeries(mix.series, mix.rows), unit = MEASURE_UNIT[by];
  return (
    <Section
      title={top ? `${top.label} has the most ${name} ${thread} ${MEASURE_NOUN[by]}` : `${name} ${thread} ${MEASURE_NOUN[by]} by model: ${emptyText(mix.rows)}`}
      summary={`Stacked bar chart of ${name} ${thread} ${MEASURE_TEXT[by]} per ${x} by model, ${scope}. Models outside the tool's top 7 are grouped as other.`}
      columns={[X_LABEL[x], ...mix.series.map((s) => s.label)]}
      rows={mix.rows.map((r) => [String(r[x]), ...mix.series.map((s) => cell(r[s.key], unit))])}
    >
      {top ? <Stacked {...mix} x={x} unit={unit} onSelect={onSelect} /> : <NoData text={emptyText(mix.rows)} />}
    </Section>
  );
}

/** Context size per week: average over long sessions, p95 and peak, with the baseline peak. */
export function ContextCard({ weeks, tool, baseline }: { weeks: Week[]; tool: Tool; baseline: number | null }) {
  const rows = contextRows(weeks, tool), name = TOOL_NAMES[tool], last = rows.findLast((r) => r.peak !== null);
  return (
    <Section
      title={last ? `${name} peak context was ${fmt(last.peak as number)} tokens in ${last.week}${baseline === null ? "" : `, baseline ${fmt(baseline)}`}` : `${name} context: no data`}
      summary={`Line chart of ${name} context size per week: the average over long sessions, the 95th percentile (p95), and the peak, for ${span(rows)}. ${baseline === null ? "There is no baseline." : `The dashed line is the baseline peak, ${fmt(baseline)} tokens.`}`}
      columns={["Week", ...CONTEXT_SERIES.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...CONTEXT_SERIES.map((s) => cell(r[s.key]))])}
    >
      {last ? (
        <Lines rows={rows} series={CONTEXT_SERIES} unit="tokens" yMax={baseline}>
          {baseline !== null && (
            <ReferenceLine y={baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Baseline peak", position: "insideTopLeft" }} />
          )}
        </Lines>
      ) : <NoData />}
    </Section>
  );
}

/** The highest share of each Codex rate-limit window used per week, against the 100% limit. */
export function RateLimits({ weeks }: { weeks: Week[] }) {
  const rows = rateRows(weeks), last = rows.findLast((r) => r.fiveHour !== null || r.weekly !== null);
  return (
    <Section
      title={last ? `In ${last.week}, Codex peaked at ${cell(last.fiveHour, "%")} of its 5-hour limit and ${cell(last.weekly, "%")} of its weekly limit` : "Codex rate limits: no data"}
      summary={`Line chart of the highest share of each Codex rate-limit window used per week, for ${span(rows)}. The line at 100% is the limit.`}
      columns={["Week", ...RATE_SERIES.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...RATE_SERIES.map((s) => cell(r[s.key], "%"))])}
    >
      {last ? (
        <Lines rows={rows} series={RATE_SERIES} unit="%" yMax={100}>
          <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Limit", position: "insideTopLeft" }} />
        </Lines>
      ) : <NoData />}
    </Section>
  );
}

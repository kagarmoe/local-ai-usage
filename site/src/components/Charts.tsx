import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Section } from "@/components/Section";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cacheReadPct, changeText, eventMarkers, fmt, modelMix, tokenRows, TOOL_NAMES, trendRows, type Kpi, type Meta, type Series, type Tool, type Week } from "@/lib/shape";

type Props = { weeks: Week[]; tool: Tool };
const cell = (v: string | number | null | undefined) => (v == null ? "no data" : typeof v === "number" ? `${fmt(v)} tokens` : v);
const span = (rows: Record<string, unknown>[]) =>
  rows.length ? `${rows.length} complete weeks, ${rows[0].week} to ${rows[rows.length - 1].week}` : "no complete weeks yet";
const colors = (series: Series): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.label === "other" ? "var(--chart-8)" : `var(--chart-${i + 1})` }]));

export function Trend({ weeks, tool, meta, kpi }: Props & { meta: Meta; kpi: Kpi }) {
  const rows = trendRows(weeks, tool), name = TOOL_NAMES[tool], change = changeText(kpi.changePct);
  const config: ChartConfig = { inputPerDay: { label: "Input per day", color: "var(--chart-1)" } };
  return (
    <Section
      title={change ? `${name} input per day ${change}` : `${name} input per day`}
      summary={`Line chart of ${name} input tokens per day for ${span(rows)}. ${kpi.baseline === null ? "There is no baseline for this tool." : `The dashed line is the baseline, ${fmt(kpi.baseline)} tokens.`}`}
      columns={["Week", "Input per day"]}
      rows={rows.map((r) => [r.week, cell(r.inputPerDay)])}
    >
      <ChartContainer config={config} className="h-64 w-full">
        <LineChart data={rows} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="week" tickLine={false} />
          <YAxis width={48} tickFormatter={fmt} domain={[0, (max: number) => Math.max(max, kpi.baseline ?? 0)]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="inputPerDay" stroke="var(--color-inputPerDay)" strokeWidth={2} />
          {kpi.baseline !== null && (
            <ReferenceLine y={kpi.baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ value: "Baseline", position: "insideTopRight" }} />
          )}
          {eventMarkers(weeks, tool, meta.events).map((e) => (
            <ReferenceLine key={e.week + e.label} x={e.week} stroke="var(--foreground)" label={{ value: e.label, position: "insideTopLeft" }} />
          ))}
        </LineChart>
      </ChartContainer>
    </Section>
  );
}

function Stacked({ rows, series, stack }: { rows: Record<string, unknown>[]; series: Series; stack: string }) {
  const config = colors(series);
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={rows} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} />
        <YAxis width={48} tickFormatter={fmt} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => <Bar key={s.key} dataKey={s.key} stackId={stack} fill={`var(--color-${s.key})`} />)}
      </BarChart>
    </ChartContainer>
  );
}

export function TokensChart({ weeks, tool }: Props) {
  const { series, rows } = tokenRows(weeks, tool), name = TOOL_NAMES[tool], pct = cacheReadPct(weeks, tool);
  return (
    <Section
      title={pct === null ? `${name} tokens by type` : `${pct}% of ${name} input is cache reads`}
      summary={`Stacked bar chart of ${name} tokens per week by type for ${span(rows)}.`}
      columns={["Week", ...series.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...series.map((s) => cell(r[s.key]))])}
    >
      <Stacked rows={rows} series={series} stack="tokens" />
    </Section>
  );
}

export function ModelMix({ weeks, tool }: Props) {
  const { series, rows } = modelMix(weeks, tool), name = TOOL_NAMES[tool];
  return (
    <Section
      title={series.length ? `${series[0].label} has the most ${name} input` : `${name} input by model`}
      summary={`Stacked bar chart of ${name} input tokens per week by model for ${span(rows)}. Models outside the top 7 are grouped as other.`}
      columns={["Week", ...series.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...series.map((s) => cell(r[s.key]))])}
    >
      <Stacked rows={rows} series={series} stack="models" />
    </Section>
  );
}

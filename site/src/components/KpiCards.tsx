import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cell, changeText, TOOL_NAMES, TOOLS, type Kpi, type Tool } from "@/lib/shape";

/** The tile's metric over the tool's plotted weeks, with gaps where there is no data. Hidden from assistive tech: the tile text carries the value. */
function Spark({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums), min = Math.min(...nums), W = 100, H = 24;
  const x = (i: number) => ((i / (values.length - 1)) * W).toFixed(1);
  const y = (v: number) => (max === min ? H / 2 : H - ((v - min) / (max - min)) * H).toFixed(1);
  const d = values.map((v, i) => (v === null ? "" : `${i > 0 && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`)).join("");
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full overflow-visible">
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One row of four tiles per tool. */
export function KpiRows({ k }: { k: Record<Tool, Kpi[]> }) {
  return (
    <>
      {TOOLS.map((t) => (
        <section key={t} aria-label={`${TOOL_NAMES[t]} key figures`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {k[t].map((tile) => (
            <Card key={tile.label}>
              <CardHeader>
                <CardDescription>{tile.tool} · {tile.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{cell(tile.latest, tile.unit)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>{tile.week ?? "No complete week"} · {tile.baseline === null ? "no baseline" : `baseline ${cell(tile.baseline, tile.unit)}`}</p>
                {tile.change !== null && <p className="font-medium text-foreground">{changeText(tile.change, tile.unit)}</p>}
                <Spark values={tile.spark} />
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </>
  );
}

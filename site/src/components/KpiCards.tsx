import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeText, fmt, type Kpi } from "@/lib/shape";

const show = (k: Kpi, v: number | null) => (v === null ? "no data" : k.unit === "%" ? `${v}%` : `${fmt(v)} tokens`);

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((k) => (
        <Card key={k.tool + k.label}>
          <CardHeader>
            <CardDescription>{k.tool} · {k.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{show(k, k.latest)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{k.week ?? "No complete week"} · baseline {show(k, k.baseline)}</p>
            {k.changePct !== null && <p className="font-medium text-foreground">{changeText(k.changePct)}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

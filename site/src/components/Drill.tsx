import { CostCard, MixCard, TokensCard } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { Link, useGo } from "@/components/Nav";
import { Section } from "@/components/Section";
import { dayCostRows, dayMix, dayOf, days, dayTokenRows, HOUR_TOKEN_SERIES, hourCostRows, hourMix, hourTokenRows, href } from "@/lib/drill";
import { fmt, heatmap, MEASURES, TOOLS, WHICH, type Measure, type Row, type Week } from "@/lib/shape";
import { cn } from "@/lib/utils";

const MEASURE_LABEL: Record<Measure, string> = { input: "Input", cost: "Cost", calls: "Calls" };
const LINK = "underline underline-offset-4";

/** Where you are; the last item is the current page. */
export function Breadcrumb({ items }: { items: { label: string; to: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-1 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={it.to} className="flex gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === items.length - 1
              ? <span aria-current="page" className="text-foreground">{it.label}</span>
              : <Link to={it.to} className={LINK}>{it.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Switches the measure of every model-mix chart on the page and keeps the week and day. */
export function MeasureSwitch({ by, to }: { by: Measure; to: (m: Measure) => string }) {
  return (
    <nav aria-label="Model mix measure" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Model mix by</span>
      {MEASURES.map((m) => (
        <Link
          key={m} to={to(m)} aria-current={m === by ? "true" : undefined}
          className={cn("rounded-md border px-3 py-1", m === by ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {MEASURE_LABEL[m]}
        </Link>
      ))}
    </nav>
  );
}

/** Links to every week you can open, newest first. */
export function WeekList({ weeks, by }: { weeks: Week[]; by: Measure }) {
  return (
    <Section title="Weeks" summary="Open a week to see it by day, and a day to see it by hour.">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {weeks.map((w) => (
          <li key={w.week}>
            <Link to={href({ week: w.week, by })} className={LINK}>{w.week}</Link> <span className="text-muted-foreground">from {w.start}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** One week, one bar per day. Clicking a bar opens that day. */
export function WeekView({ weeks, w, by }: { weeks: Week[]; w: Week; by: Measure }) {
  const go = useGo(), open = (r: Row) => go(href({ week: w.week, day: String(r.date), by })), scope = `for each day of ${w.week}`;
  return (
    <>
      <nav aria-label={`Days of ${w.week}`}>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {days(w).map((d) => <li key={d.date}><Link to={href({ week: w.week, day: d.date, by })} className={LINK}>{d.label}</Link></li>)}
        </ul>
      </nav>
      <div className="grid gap-6 lg:grid-cols-2">
        {TOOLS.map((t) => <TokensCard key={t} tool={t} data={dayTokenRows(w, t)} x="day" scope={scope} onSelect={open} />)}
        {TOOLS.map((t) => <CostCard key={t} tool={t} rows={dayCostRows(w, t)} x="day" scope={scope} onSelect={open} />)}
        <div className="lg:col-span-2"><MeasureSwitch by={by} to={(m) => href({ week: w.week, by: m })} /></div>
        {WHICH.flatMap((which) => TOOLS.map((t) => (
          <MixCard key={t + which} tool={t} by={by} which={which} mix={dayMix(weeks, w, t, by, which)} x="day" scope={scope} onSelect={open} />
        )))}
      </div>
      <Heatmap grid={heatmap([w])} scope={`in ${w.week}`} />
    </>
  );
}

/** One day, one bar per hour. */
export function DayView({ weeks, w, day, by }: { weeks: Week[]; w: Week; day: string; by: Measure }) {
  const label = days(w).find((d) => d.date === day)?.label ?? day, scope = `for each hour of ${label} (${w.week})`;
  return (
    <>
      <MeasureSwitch by={by} to={(m) => href({ week: w.week, day, by: m })} />
      <div className="grid gap-6 lg:grid-cols-2">
        {WHICH.flatMap((which) => TOOLS.map((t) => (
          <MixCard key={t + which} tool={t} by={by} which={which} mix={hourMix(weeks, w, day, t, by, which)} x="hour" scope={scope} />
        )))}
        {TOOLS.map((t) => {
          const d = dayOf(w, day, t);
          const note = d && `Day totals by type: ${fmt(d.tokens.input)} uncached input, ${fmt(d.tokens.cacheRead)} cache read, ${fmt(d.tokens.cacheWrite)} cache write, ${fmt(d.tokens.output)} output.`;
          return <TokensCard key={t} tool={t} data={{ series: HOUR_TOKEN_SERIES, rows: hourTokenRows(w, day, t) }} x="hour" scope={scope} note={note ?? undefined} />;
        })}
        {TOOLS.map((t) => <CostCard key={t} tool={t} rows={hourCostRows(w, day, t)} x="hour" scope={scope} />)}
      </div>
    </>
  );
}

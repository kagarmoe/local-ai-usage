import { Section } from "@/components/Section";
import { DAYS, fmt, heatmap, type Week } from "@/lib/shape";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/** 7 × 24 HTML table: one hue at increasing strength, and each cell prints its value. */
export function Heatmap({ weeks }: { weeks: Week[] }) {
  const grid = heatmap(weeks), max = Math.max(...grid.flat());
  const peak = grid.flatMap((r, d) => r.map((v, h) => ({ v, d, h }))).reduce((a, b) => (b.v > a.v ? b : a));
  return (
    <Section
      title={max ? `Busiest hour: ${DAYS[peak.d]} ${HOURS[peak.h]}:00` : "Input by weekday and hour"}
      summary="Input tokens by weekday and hour (Pacific time), summed over all complete weeks of Claude Code and Codex. Stronger color means more input."
    >
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px] tabular-nums">
          <caption className="sr-only">Input tokens by weekday and hour</caption>
          <thead>
            <tr>
              <td />
              {HOURS.map((h) => <th key={h} scope="col" className="font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={DAYS[d]}>
                <th scope="row" className="pr-1 text-left font-normal">{DAYS[d]}</th>
                {row.map((v, h) => {
                  const pct = max ? Math.round((v / max) * 100) : 0;
                  return (
                    <td key={h} className="h-7 min-w-8 px-0.5 text-center"
                      style={{ background: `color-mix(in oklch, var(--chart-1) ${Math.round(pct * 0.85)}%, transparent)` }}>
                      {v ? fmt(v) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

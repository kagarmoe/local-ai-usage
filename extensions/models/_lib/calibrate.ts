import type { CostState } from "./claude.ts";
import { priceCall, type Rate } from "./prices.ts";

// shortcut: Anthropic list prices keep fixed ratios to the input rate (cache read 0.1×, 5-minute cache write 1.25×,
// output 5×), so one number per model is fitted. Fit all four rates if costCheck drifts past 2%.
const RATIO = { cacheRead: 0.1, cacheWrite: 1.25, output: 5 };
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
// costUSD includes server-side web search, billed per request rather than per token.
const WEB_SEARCH_USD = 0.01;
const webSearch = (u: { webSearchRequests?: number }) => WEB_SEARCH_USD * (u.webSearchRequests ?? 0);

/** Add a fitted rate for each model in `costStates` that has no rate. Existing rates are kept unchanged. */
export function calibrate(costStates: CostState[], existing: Record<string, Rate>): Record<string, Rate> {
  const sums = new Map<string, { cost: number; units: number }>();
  for (const cs of costStates) {
    for (const [model, u] of Object.entries(cs.modelUsage ?? {})) {
      if (existing[model]) continue;
      const s = sums.get(model) ?? { cost: 0, units: 0 };
      s.cost += u.costUSD - webSearch(u);
      s.units += u.inputTokens + RATIO.cacheRead * u.cacheReadInputTokens +
        RATIO.cacheWrite * u.cacheCreationInputTokens + RATIO.output * u.outputTokens;
      sums.set(model, s);
    }
  }
  const out = { ...existing };
  for (const [model, s] of sums) {
    if (!s.units) continue;
    const input = round4((s.cost / s.units) * 1e6);
    out[model] = {
      input,
      cacheRead: round4(input * RATIO.cacheRead),
      cacheWrite: round4(input * RATIO.cacheWrite),
      output: round4(input * RATIO.output),
    };
  }
  return out;
}

/** Price-table check: priced cost-state tokens vs Claude Code's own cost, over fully priced sessions. */
export function costCheck(costStates: CostState[], rates: Record<string, Rate>): { sessions: number; deltaPct: number } {
  let estimate = 0, actual = 0, sessions = 0;
  for (const cs of costStates) {
    const usage = Object.entries(cs.modelUsage ?? {});
    if (!usage.length || usage.some(([m]) => !rates[m])) continue;
    for (const [model, u] of usage) {
      estimate += priceCall(rates, {
        model, input: u.inputTokens, cacheRead: u.cacheReadInputTokens, cacheWrite: u.cacheCreationInputTokens, output: u.outputTokens,
      })! + webSearch(u);
      actual += u.costUSD;
    }
    sessions++;
  }
  return { sessions, deltaPct: actual ? Math.round(((estimate - actual) / actual) * 1000) / 10 : 0 };
}

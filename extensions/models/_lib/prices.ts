import { parse, stringify } from "jsr:@std/yaml@1.3.0";
import { z } from "npm:zod@4";

/** USD per million tokens. */
export const RateSchema = z.object({ input: z.number(), cacheRead: z.number(), cacheWrite: z.number(), output: z.number() });
/** prices.yaml as data. Scans placed on a worker take it as an argument: a worker has no checkout to read. */
export const PricesSchema = z.object({ claude: z.record(z.string(), RateSchema), codex: z.record(z.string(), RateSchema) });
export type Rate = z.infer<typeof RateSchema>;
export type Prices = z.infer<typeof PricesSchema>;

const HEADER = "# USD per million tokens. claude: scans add missing models from cost-state records. codex: enter by hand.\n";

export function loadPrices(path: string): Prices {
  const p = (parse(Deno.readTextFileSync(path)) ?? {}) as Partial<Prices>;
  return { claude: p.claude ?? {}, codex: p.codex ?? {} };
}

export function savePrices(path: string, p: Prices): void {
  Deno.writeTextFileSync(path, HEADER + stringify(p, { sortKeys: true }));
}

/** `prices` plus every rate in `added` for a model it lacks. Existing rates are kept unchanged. */
export function addRates(prices: Prices, added: Record<string, Rate>): { prices: Prices; models: string[] } {
  const models = Object.keys(added).filter((m) => !prices.claude[m]).sort();
  const claude = { ...prices.claude };
  for (const m of models) claude[m] = added[m];
  return { prices: { ...prices, claude }, models };
}

/** Cost of one call, or null when the model has no rate. Reasoning is inside output, so it is not priced again. */
export function priceCall(
  rates: Record<string, Rate>,
  c: { model: string; input: number; cacheRead: number; cacheWrite: number; output: number },
): number | null {
  const r = rates[c.model];
  return r ? (c.input * r.input + c.cacheRead * r.cacheRead + c.cacheWrite * r.cacheWrite + c.output * r.output) / 1e6 : null;
}

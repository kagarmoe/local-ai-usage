import { parse, stringify } from "jsr:@std/yaml@1.3.0";

/** USD per million tokens. */
export type Rate = { input: number; cacheRead: number; cacheWrite: number; output: number };
export type Prices = { claude: Record<string, Rate>; codex: Record<string, Rate> };

const HEADER = "# USD per million tokens. claude: scans add missing models from cost-state records. codex: enter by hand.\n";

export function loadPrices(path: string): Prices {
  const p = (parse(Deno.readTextFileSync(path)) ?? {}) as Partial<Prices>;
  return { claude: p.claude ?? {}, codex: p.codex ?? {} };
}

export function savePrices(path: string, p: Prices): void {
  Deno.writeTextFileSync(path, HEADER + stringify(p, { sortKeys: true }));
}

/** Cost of one call, or null when the model has no rate. Reasoning is inside output, so it is not priced again. */
export function priceCall(
  rates: Record<string, Rate>,
  c: { model: string; input: number; cacheRead: number; cacheWrite: number; output: number },
): number | null {
  const r = rates[c.model];
  return r ? (c.input * r.input + c.cacheRead * r.cacheRead + c.cacheWrite * r.cacheWrite + c.output * r.output) / 1e6 : null;
}

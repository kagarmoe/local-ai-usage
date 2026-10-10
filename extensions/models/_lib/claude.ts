import type { Call } from "./aggregate.ts";
import { readJsonl } from "./jsonl.ts";

export type CostState = {
  sessionId: string;
  startTime: number; // epoch ms
  totalCostUSD: number;
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
    webSearchRequests?: number;
  }>;
};

/** Parse Claude Code transcripts under `root` (the projects dir). The first path segment names the project (private). */
export function parseClaude(files: string[], root: string): { calls: Call[]; costStates: CostState[]; skipped: number } {
  const byId = new Map<string, Call>();
  const costs = new Map<string, CostState>();
  let skipped = 0;
  for (const f of files) {
    const { rows, skipped: s } = readJsonl(f);
    skipped += s;
    const project = f.slice(root.length + 1).split("/")[0];
    const subFile = f.includes("/subagents/");
    for (const r of rows) {
      if (r.type === "cost-state" && r.sessionId) {
        costs.set(r.sessionId, r as CostState); // cumulative: the last record per session wins
        continue;
      }
      const m = r.message;
      if (r.type !== "assistant" || !m?.id || !m.usage || m.model === "<synthetic>") continue;
      const main = !(subFile || r.isSidechain);
      // Streaming writes one line per content block with the same id; the last line wins.
      byId.set(m.id, {
        ts: new Date(r.timestamp),
        session: main ? r.sessionId : f,
        main,
        model: m.model,
        project,
        input: m.usage.input_tokens ?? 0,
        cacheRead: m.usage.cache_read_input_tokens ?? 0,
        cacheWrite: m.usage.cache_creation_input_tokens ?? 0,
        output: m.usage.output_tokens ?? 0,
        reasoning: 0,
        costUSD: null,
      });
    }
  }
  return { calls: [...byId.values()], costStates: [...costs.values()], skipped };
}

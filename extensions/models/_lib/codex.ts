import type { Call } from "./aggregate.ts";
import { readJsonl, type Row } from "./jsonl.ts";

export type RateSample = { ts: Date; fiveHour: number | null; weekly: number | null };

/** Parse Codex session logs. Each file is one session; `session_meta.source.subagent` marks subagent sessions. */
export function parseCodex(files: string[]): { calls: Call[]; rates: RateSample[]; skipped: number } {
  const calls: Call[] = [];
  const rates: RateSample[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const f of files) {
    const { rows, skipped: s } = readJsonl(f);
    skipped += s;
    // Newer logs write token_usage_record per response; then token_count usage would double count.
    const useRecords = rows.some((r) => r.type === "token_usage_record");
    let main = true, project = "", model = "unknown", lastTotal = "";
    for (const r of rows) {
      const p = r.payload ?? {};
      if (r.type === "session_meta") {
        main = !(p.source && typeof p.source === "object" && "subagent" in p.source);
        project = String(p.cwd ?? "").split("/").pop() ?? "";
        continue;
      }
      if (r.type === "turn_context") {
        model = p.model ?? model;
        continue;
      }
      let u: Row | undefined;
      if (r.type === "token_usage_record") {
        if (seen.has(p.response_id)) continue;
        seen.add(p.response_id);
        u = p.usage;
      } else if (r.type === "event_msg" && p.type === "token_count") {
        if (p.rate_limits) {
          rates.push({
            ts: new Date(r.timestamp),
            fiveHour: p.rate_limits.primary?.used_percent ?? null,
            weekly: p.rate_limits.secondary?.used_percent ?? null,
          });
        }
        if (useRecords || !p.info) continue;
        const total = JSON.stringify(p.info.total_token_usage);
        if (total === lastTotal) continue; // repeated event: no new call
        lastTotal = total;
        u = p.info.last_token_usage;
      }
      if (!u) continue;
      const cached = u.cached_input_tokens ?? 0;
      calls.push({
        ts: new Date(r.timestamp),
        session: f,
        main,
        model,
        project,
        input: Math.max(0, (u.input_tokens ?? 0) - cached), // input_tokens includes cached tokens
        cacheRead: cached,
        cacheWrite: u.cache_write_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        reasoning: u.reasoning_output_tokens ?? 0,
        costUSD: null,
      });
    }
  }
  return { calls, rates, skipped };
}

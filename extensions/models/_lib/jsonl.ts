export type Row = Record<string, any>;

/** Every *.jsonl file under dir, recursively. Throws if dir is missing. */
export function listJsonl(dir: string): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) out.push(...listJsonl(p));
    else if (e.isFile && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

/** Parsed rows of a JSONL file. Bad lines, including a half-written last line, are counted, not thrown. */
export function readJsonl(path: string): { rows: Row[]; skipped: number } {
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of Deno.readTextFileSync(path).split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      skipped++;
    }
  }
  return { rows, skipped };
}

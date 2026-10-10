// The dashboard's two data files, rendered from the public summary.
export type DataFile = { pathname: string; content: string };

export async function render(pub: any): Promise<{ hash: string; files: DataFile[] }> {
  if (pub?.schemaVersion !== 1) throw new Error(`unsupported summary schemaVersion: ${pub?.schemaVersion}`);
  const { schemaVersion, generatedAt, costBasis, baseline, events, weeks } = pub;
  const meta = { schemaVersion, generatedAt, costBasis, baseline, events };
  const files = [
    { pathname: "data/meta.json", content: JSON.stringify(meta) + "\n" },
    { pathname: "data/weeks.jsonl", content: (weeks as unknown[]).map((w) => JSON.stringify(w) + "\n").join("") },
  ];
  // generatedAt is the latest scan time and changes every run; hashing it would defeat the upload guard.
  const hashed = [{ ...files[0], content: JSON.stringify({ ...meta, generatedAt: null }) }, files[1]];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashed)));
  return { hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""), files };
}

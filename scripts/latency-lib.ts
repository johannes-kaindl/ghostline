/** Reine Hilfen fuer scripts/latency.ts (kein Netz, kein Dateizugriff) — getrennt, damit vitest sie pruefen kann. */

export interface LatencyArgs { endpoint: string; models: string[]; runs: number }

export function parseArgs(argv: readonly string[]): LatencyArgs | { error: string } {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const endpoint = get("endpoint");
  const models = (get("models") ?? "").split(",").map((m) => m.trim()).filter((m) => m !== "");
  const runsRaw = get("runs");
  const runs = runsRaw === undefined ? 5 : Number(runsRaw);
  if (!endpoint) return { error: "--endpoint fehlt (z. B. http://127.0.0.1:1234)" };
  if (models.length === 0) return { error: "--models fehlt (kommagetrennt)" };
  if (!Number.isInteger(runs) || runs < 1 || runs > 50) return { error: "--runs muss eine ganze Zahl von 1 bis 50 sein" };
  return { endpoint: endpoint.replace(/\/+$/, ""), models, runs };
}

/** Perzentil nach dem Nearest-Rank-Verfahren; leere Liste ergibt `null`. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length)));
  return s[rank - 1] ?? null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? 0;
  return s.length % 2 === 1 ? hi : ((s[mid - 1] ?? 0) + hi) / 2;
}

export const fmtMs = (v: number | null): string => (v === null ? "–" : `${Math.round(v)} ms`);

/** Text-Anteile einer SSE-Zeilenfolge: Chat liest `delta.content`, FIM `choices[0].text`. */
export function parseSseText(buffer: string, kind: "chat" | "fim"): { texts: string[]; rest: string } {
  const lines = buffer.split(/\r\n|\n|\r/);
  const rest = lines.pop() ?? "";
  const texts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "" || data === "[DONE]") continue;
    try {
      const j = JSON.parse(data) as { choices?: { text?: unknown; delta?: { content?: unknown } }[] };
      const c0 = j.choices?.[0];
      const v = kind === "chat" ? c0?.delta?.content : c0?.text;
      if (typeof v === "string" && v !== "") texts.push(v);
    } catch { /* unvollstaendige oder fremde Zeile */ }
  }
  return { texts, rest };
}

export interface Row { model: string; path: string; cold: string; warmMedian: string; warmP90: string; abort: string; sample: string }

const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function formatTable(rows: readonly Row[]): string {
  const head = "| Modell | Weg | kalt | warm Median | warm p90 | Abbruchprobe | Beispielantwort |\n|---|---|---|---|---|---|---|";
  const body = rows.map((r) => `| ${[r.model, r.path, r.cold, r.warmMedian, r.warmP90, r.abort, r.sample].map(cell).join(" | ")} |`);
  return [head, ...body].join("\n");
}

/** Abbruchprobe: deutlich laenger als warm (Faktor 2 und mindestens 300 ms mehr) heisst, der Server rechnet weiter. */
export function abortVerdict(afterAbort: number | null, warmMedian: number | null): string {
  if (afterAbort === null) return "–";
  if (warmMedian === null) return fmtMs(afterAbort);
  const slower = afterAbort > warmMedian * 2 && afterAbort - warmMedian > 300;
  return `${fmtMs(afterAbort)} (${slower ? "rechnet weiter?" : "ok"})`;
}

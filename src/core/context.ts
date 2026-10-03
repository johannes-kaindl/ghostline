export interface CompletionContext { title: string; extra: string; before: string; after: string }
export interface ContextInput { title: string; docText: string; cursor: number; maxBefore: number; maxAfter: number; extra?: string }

const QUERY_BLOCK = /```(?:dataview|dataviewjs|base)[^\n]*\n[\s\S]*?```/g;
const REDACTIONS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, "Bearer [redacted-token]"],
  [/\b(?:sk|rk|pk|ghp|gho|github_pat|xoxb|xoxp)[-_][A-Za-z0-9_-]{12,}/g, "[redacted-token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-token]"],
];

export function removeQueryBlocks(text: string): string { return text.replace(QUERY_BLOCK, ""); }
export function redact(text: string): string { return REDACTIONS.reduce((t, [re, rep]) => t.replace(re, rep), text); }

/** Anfang des Fensters über `text`: die früheste Absatzgrenze, ab der höchstens `max` Zeichen
 *  bleiben. Springt dadurch absatzweise — der Prompt-Anfang bleibt zwischen zwei Anfragen
 *  gleich und LM Studio kann ihn zwischenspeichern (Spec § 7.1). */
export function windowStart(text: string, max: number): number {
  if (text.length <= max) return 0;
  const minStart = text.length - max;
  for (const m of text.matchAll(/\n\s*\n/g)) {
    const b = (m.index ?? 0) + m[0].length;
    if (b >= minStart) return b;
  }
  for (const m of text.matchAll(/[.!?…]\s+/g)) {
    const s = (m.index ?? 0) + m[0].length;
    if (s >= minStart) return s;
  }
  return minStart;
}

function frontmatterEnd(doc: string): number {
  if (!/^---\r?\n/.test(doc)) return 0;
  const m = /\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(doc.slice(3));
  return m ? 3 + (m.index ?? 0) + m[0].length : doc.length;
}

export function buildContext(i: ContextInput): CompletionContext {
  const fm = frontmatterEnd(i.docText);
  const rawBefore = removeQueryBlocks(i.docText.slice(Math.min(fm, i.cursor), i.cursor));
  const before = redact(rawBefore.slice(windowStart(rawBefore, i.maxBefore)));
  const after = redact(removeQueryBlocks(i.docText.slice(i.cursor))).slice(0, i.maxAfter);
  return { title: redact(i.title), extra: i.extra ?? "", before, after };
}

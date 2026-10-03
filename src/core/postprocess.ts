import { CURSOR_MARK } from "./prompt";

const QUOTES: [string, string][] = [["\"", "\""], ["'", "'"], ["„", "“"], ["“", "”"], ["»", "«"], ["«", "»"]];
const WORDCH = /[\p{L}\p{N}]/u;

function stripWrappers(s: string): string {
  let t = s.replace(CURSOR_MARK, "");
  if (t.trimStart().startsWith("```")) t = t.trimStart().replace(/^```[^\n]*\n?/, "");
  t = t.replace(/\n?```\s*$/, "");
  t = t.replace(/^\$\$|\$\$$/g, "");
  const trimmed = t.trim();
  for (const [o, c] of QUOTES) {
    if (trimmed.length >= 2 && trimmed.startsWith(o) && trimmed.endsWith(c)) { t = trimmed.slice(o.length, -c.length); break; }
  }
  return t;
}

function boundaryAfter(s: string, len: number): boolean {
  const next = s.charAt(len);
  return next === "" || !WORDCH.test(next);
}

/** Längstes Ende von `before`, das an einer Wortgrenze beginnt und mit dem die Antwort anfängt. */
function removePrefixOverlap(before: string, completion: string): string {
  const c = completion.trimStart();
  for (let i = 0; i < before.length; i++) {
    if (before.charAt(i) === " " || (i > 0 && !/\s/.test(before.charAt(i - 1)))) continue;
    const tail = before.slice(i).trimEnd();
    if (tail.length > 0 && c.startsWith(tail) && boundaryAfter(c, tail.length)) return c.slice(tail.length);
  }
  return completion;
}

function removeSuffixOverlap(completion: string, after: string): string {
  const a = after.trimStart();
  if (a === "") return completion;
  for (let i = 0; i < completion.length; i++) {
    if (i > 0 && !/\s/.test(completion.charAt(i - 1))) continue;
    const tail = completion.slice(i).trim();
    if (tail.length > 0 && a.startsWith(tail) && boundaryAfter(a, tail.length)) return completion.slice(0, i).trimEnd();
  }
  return completion;
}

function seam(before: string, completion: string): string {
  const c = completion.trimStart();
  if (c === "") return "";
  const last = before.charAt(before.length - 1);
  if (last === "" || /\s/.test(last)) return c;
  if (/[.!?…:;,)\]“”»«’"]/.test(last) && WORDCH.test(c.charAt(0))) return ` ${c}`;
  if (WORDCH.test(last) && WORDCH.test(c.charAt(0))) return ` ${c}`;
  return c;
}

export function cleanCompletion(raw: string, before: string, after: string, final: boolean): string {
  let t = stripWrappers(raw);
  if (t.search(/\r?\n/) === 0) t = t.replace(/^\r?\n+/, "");
  const nl = t.search(/\r?\n/);
  if (nl >= 0) t = t.slice(0, nl);
  t = removePrefixOverlap(before, t);
  t = removeSuffixOverlap(t, after);
  t = seam(before, t);
  if (!final) {
    const lastSpace = t.search(/\s\S*$/);
    t = lastSpace > 0 ? t.slice(0, lastSpace) : (/\s$/.test(t) ? t.trimEnd() : "");
  }
  return t.trim() === "" ? "" : t.replace(/\s+$/, "");
}

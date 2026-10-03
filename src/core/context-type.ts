export type BlockKind = "text" | "frontmatter" | "code" | "math" | "table" | "inline-code";

const FENCE = /^(`{3,}|~{3,})/;

function closesFence(line: string, fence: string): boolean {
  const t = line.trim();
  return t.length >= fence.length && [...t].every((c) => c === fence[0]);
}

/** Inline-Formel nach Obsidian-Art: öffnendes `$` vor einem Nicht-Leerzeichen, das keine Ziffer
 *  ist; schließendes `$` nach einem Nicht-Leerzeichen. `\$` zählt nicht. */
function inInlineMath(before: string): boolean {
  let open = false;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== "$" || before[i - 1] === "\\" || before[i + 1] === "$" || before[i - 1] === "$") continue;
    const next = before[i + 1] ?? "";
    const prev = before[i - 1] ?? "";
    if (!open) { if (next !== "" && !/\s|\d/.test(next)) open = true; }
    else if (prev !== "" && !/\s/.test(prev)) open = false;
  }
  return open;
}

export function blockKindAt(lines: readonly string[], line: number, ch: number): BlockKind {
  let start = 0;
  if ((lines[0] ?? "").trim() === "---") {
    let close = -1;
    for (let i = 1; i < lines.length; i++) if (/^(---|\.\.\.)\s*$/.test(lines[i] ?? "")) { close = i; break; }
    if (close === -1 || line <= close) return "frontmatter";
    start = close + 1;
  }
  let fence: string | null = null;
  let math = false;
  for (let i = start; i < line; i++) {
    const t = (lines[i] ?? "").trimStart();
    if (fence !== null) { if (closesFence(t, fence)) fence = null; continue; }
    const m = FENCE.exec(t);
    if (m) { fence = m[1] ?? null; continue; }
    if (t.trim() === "$$") math = !math;
  }
  if (fence !== null) return "code";
  if (math) return "math";
  const cur = lines[line] ?? "";
  const tc = cur.trimStart();
  if (FENCE.test(tc)) return "code";
  if (tc.startsWith("$$")) return "math";
  if (tc.startsWith("|")) return "table";
  const before = cur.slice(0, ch);
  if (((before.match(/`/g) ?? []).length) % 2 === 1) return "inline-code";
  if (inInlineMath(before)) return "math";
  return "text";
}

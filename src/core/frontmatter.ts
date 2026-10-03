/** Eine Frontmatter-Erkennung für Kontext (`context.ts`) und Blockart (`context-type.ts`), damit
 *  beide dieselbe Notiz gleich lesen (Final-Review M6): öffnendes `---` nur in der ersten Zeile,
 *  schließend `---` oder `...`; Leerzeichen und Tabs am Zeilenende sowie ein `\r` (CRLF) sind erlaubt. */
const OPEN = /^---[ \t]*\r?$/;
const CLOSE = /^(---|\.\.\.)[ \t]*\r?$/;

/** Zeilenindex der schließenden Zeile; `-1` = nicht geschlossen (reicht bis zum Ende), `null` = keine Frontmatter. */
export function frontmatterCloseLine(lineAt: (i: number) => string | undefined): number | null {
  if (!OPEN.test(lineAt(0) ?? "")) return null;
  for (let i = 1; ; i++) {
    const line = lineAt(i);
    if (line === undefined) return -1;
    if (CLOSE.test(line)) return i;
  }
}

/** Zeichenposition hinter der Frontmatter (hinter dem Zeilenumbruch der Schlusszeile); 0 ohne Frontmatter. */
export function frontmatterEnd(doc: string): number {
  const starts = [0];
  const lineAt = (i: number): string | undefined => {
    while (starts.length <= i) {
      const prev = starts[starts.length - 1] ?? 0;
      const nl = doc.indexOf("\n", prev);
      if (nl < 0) return undefined;
      starts.push(nl + 1);
    }
    const s = starts[i] ?? 0;
    const nl = doc.indexOf("\n", s);
    return nl < 0 ? doc.slice(s) : doc.slice(s, nl);
  };
  const close = frontmatterCloseLine(lineAt);
  if (close === null) return 0;
  if (close === -1) return doc.length;
  const s = starts[close] ?? 0;
  const nl = doc.indexOf("\n", s);
  return nl < 0 ? doc.length : nl + 1;
}

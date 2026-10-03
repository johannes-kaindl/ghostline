import { normalizeFolderPath, parsePatterns, type IgnoreRule } from "../vendor/kit/ignore";

/** Jede Pfadstufe wird geprüft; auf einer Stufe gewinnt die letzte treffende Regel, die tiefste
 *  Stufe mit Treffer entscheidet. `matchIgnore` aus dem Kit prüft nur EINEN Pfad und meldet eine
 *  negierte Regel wie „kein Treffer" — für die Stufenfolge braucht es die Regelfelder selbst. */
export function isPathExcluded(rules: readonly IgnoreRule[], filePath: string): boolean {
  const segs = normalizeFolderPath(filePath).split("/").filter((s) => s !== "");
  let excluded = false;
  for (let i = 1; i <= segs.length; i++) {
    const levelPath = segs.slice(0, i).join("/");
    const name = segs[i - 1] ?? "";
    let hit: IgnoreRule | null = null;
    for (const r of rules) if (r.regex.test(r.anchored ? levelPath : name)) hit = r;
    if (hit) excluded = !hit.negate;
  }
  return excluded;
}

export function frontmatterDisabled(frontmatter: unknown): boolean {
  return typeof frontmatter === "object" && frontmatter !== null && (frontmatter as Record<string, unknown>).ghostline === false;
}

/** Ausschluss je Pfad, gemerkt bis zur nächsten Änderung an Mustern oder Frontmatter (Spec § 6.4).
 *  Ein Pfad, der schon am Muster scheitert, fragt das Frontmatter gar nicht erst ab. */
export function createExclusionCache(patterns: () => string, frontmatterOf: (path: string) => unknown) {
  const memo = new Map<string, boolean>();
  let rules = parsePatterns(patterns()).rules;
  return {
    isExcluded(path: string): boolean {
      const hit = memo.get(path);
      if (hit !== undefined) return hit;
      const v = isPathExcluded(rules, path) || frontmatterDisabled(frontmatterOf(path));
      memo.set(path, v);
      return v;
    },
    invalidate(): void { memo.clear(); rules = parsePatterns(patterns()).rules; },
  };
}

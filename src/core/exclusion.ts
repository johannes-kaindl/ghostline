import { isIgnoredByLevels, parsePatterns, type IgnoreRule } from "../vendor/kit/ignore";

/** Jede Pfadstufe wird geprüft; auf einer Stufe gewinnt die letzte treffende Regel, die tiefste Stufe mit Treffer entscheidet
 *  (eine Negation in einer tieferen Stufe gibt einen Treffer einer höheren frei). Die Auswertung liefert seit code-kit 0.64.0
 *  das Kit (`isIgnoredByLevels`); `matchIgnoreChain` lässt dagegen einen Vorfahr-Treffer stehen und ist hier die falsche Funktion. */
export function isPathExcluded(rules: readonly IgnoreRule[], filePath: string): boolean {
  return isIgnoredByLevels(rules, filePath);
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

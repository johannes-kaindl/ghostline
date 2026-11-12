import { describe, expect, it } from "vitest";
import { matchIgnoreChain, normalizeFolderPath, parsePatterns, type IgnoreRule } from "../src/vendor/kit/ignore";
import { isPathExcluded } from "../src/core/exclusion";

/** Differenztest (Welle 33): ghostlines `isPathExcluded` gegen `matchIgnoreChain` des Kits und gegen die frühere Eigenfassung.
 *  Befund (code-kit 0.63.0): `matchIgnoreChain` und die damalige Eigenfassung stimmen überein, solange keine Negation in einer
 *  TIEFEREN Stufe einen Treffer einer höheren Stufe freigibt. Dort weichen sie ab (26 von 348 Fällen): `matchIgnoreChain` lässt den
 *  Vorfahr-Treffer stehen („earlier hit stays a hit"), die Eigenfassung gibt frei (die tiefste Stufe mit Treffer entscheidet).
 *  Ghostlines Verhalten ist durch exclusion.test.ts („Ausnahme innerhalb eines ausgeschlossenen Ordners", `!80_Archiv/keep.md`)
 *  festgelegt und gewollt. Seit code-kit 0.64.0 liefert das Kit diese Auswertung als `isIgnoredByLevels`; `isPathExcluded` ruft sie.
 *  Abnahme der Umstellung: `isPathExcluded` stimmt auf allen 348 Fällen mit der unverändert hier festgehaltenen früheren Eigenfassung überein. */
function legacyIsPathExcluded(rules: readonly IgnoreRule[], filePath: string): boolean {
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
const chain = (patterns: string, path: string) => matchIgnoreChain(parsePatterns(patterns).rules, path) !== null;
const own = (patterns: string, path: string) => isPathExcluded(parsePatterns(patterns).rules, path);
const legacy = (patterns: string, path: string) => legacyIsPathExcluded(parsePatterns(patterns).rules, path);

const SETS: string[] = [
  "", "A/", "a.md", "*", "A/b", "A/**", "**/b", "*.md",
  "!A/b", "!b", "!A/b/c.md", "!*.md", "!A/**",
  "A/\n!A/b", "A/\n!b", "A/\n!A/b/c.md", "A/\n!A/b.md", "A/\n!*.md", "A/b\n!A/b/c.md",
  "*\n!A/**", "*\n!A", "*\n!A/b", "*.md\n!b.md", "A/\n!A/b\nA/b/c.md", "!A/b\nA/", "A/b\n!A/b\nA/b",
  "A/**\n!A/b/**", "A/\n!A/\n", "b/\n!A/b/c.md",
];
const PATHS: string[] = ["a.md", "b", "b.md", "A", "A/a.md", "A/b", "A/b.md", "A/b/c.md", "A/b/d/e.md", "X/A/b/c.md", "B/b.md", "A/x/b"];

describe("isPathExcluded gegen matchIgnoreChain", () => {
  it("Messraster nicht leer (Gegenprobe zu CORE-TEST-16)", () => {
    expect(SETS.length * PATHS.length).toBeGreaterThan(300);
  });

  it("Ohne Negation im Muster stimmen beide immer überein", () => {
    let n = 0;
    for (const s of SETS.filter((p) => !p.includes("!"))) {
      for (const p of PATHS) { expect(own(s, p), `${JSON.stringify(s)} @ ${p}`).toBe(chain(s, p)); n++; }
    }
    expect(n).toBeGreaterThan(90);
  });

  it("Jede Abweichung ist eine Freigabe durch ghostline: isPathExcluded=false, Kit-Kette=Treffer — nie umgekehrt", () => {
    const diffs: string[] = [];
    for (const s of SETS) {
      for (const p of PATHS) {
        const a = own(s, p), b = chain(s, p);
        if (a === b) continue;
        expect(a, `${JSON.stringify(s)} @ ${p}`).toBe(false);
        expect(b).toBe(true);
        diffs.push(`${JSON.stringify(s)} @ ${p}`);
      }
    }
    // Es gibt Abweichungen (sonst wäre die Zweitfunktion im Kit überflüssig) – gemessen, nicht angenommen.
    expect(diffs.length).toBeGreaterThan(0);
    if (process.env.DIFF_ZAHL) console.info(`DIFF ${diffs.length} von ${SETS.length * PATHS.length}`);
  });

  it("Abnahme der Umstellung auf das Kit: isPathExcluded stimmt mit der früheren Eigenfassung auf allen Fällen überein", () => {
    let n = 0;
    for (const s of SETS) for (const p of PATHS) { expect(own(s, p), `${JSON.stringify(s)} @ ${p}`).toBe(legacy(s, p)); n++; }
    expect(n).toBe(SETS.length * PATHS.length);
  });

  it("Beispiele der Abweichung", () => {
    expect(own("A/\n!A/b", "A/b/c.md")).toBe(false);
    expect(chain("A/\n!A/b", "A/b/c.md")).toBe(true);
    expect(own("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/keep.md")).toBe(false);
    expect(chain("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/keep.md")).toBe(true);
  });
});

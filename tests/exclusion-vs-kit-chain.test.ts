import { describe, expect, it } from "vitest";
import { matchIgnoreChain, parsePatterns } from "../src/vendor/kit/ignore";
import { isPathExcluded } from "../src/core/exclusion";

/** Differenztest (Welle 33): ghostlines `isPathExcluded` gegen `matchIgnoreChain` des Kits (code-kit 0.63.0).
 *  Befund: beide stimmen überein, solange keine Negation in einer TIEFEREN Stufe einen Treffer einer höheren Stufe freigibt.
 *  Dort weichen sie ab: `matchIgnoreChain` lässt den Vorfahr-Treffer stehen („earlier hit stays a hit"), `isPathExcluded`
 *  gibt frei (die tiefste Stufe mit Treffer entscheidet). Ghostlines Verhalten ist durch exclusion.test.ts („Ausnahme
 *  innerhalb eines ausgeschlossenen Ordners", `!80_Archiv/keep.md`) festgelegt und gewollt. */
const chain = (patterns: string, path: string) => matchIgnoreChain(parsePatterns(patterns).rules, path) !== null;
const own = (patterns: string, path: string) => isPathExcluded(parsePatterns(patterns).rules, path);

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

  it("Beispiele der Abweichung", () => {
    expect(own("A/\n!A/b", "A/b/c.md")).toBe(false);
    expect(chain("A/\n!A/b", "A/b/c.md")).toBe(true);
    expect(own("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/keep.md")).toBe(false);
    expect(chain("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/keep.md")).toBe(true);
  });
});

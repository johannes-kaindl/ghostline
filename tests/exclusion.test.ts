import { describe, expect, it } from "vitest";
import { parsePatterns } from "../src/vendor/kit/ignore";
import { createExclusionCache, frontmatterDisabled, isPathExcluded } from "../src/core/exclusion";

const ex = (patterns: string, path: string) => isPathExcluded(parsePatterns(patterns).rules, path);

describe("isPathExcluded", () => {
  it("ohne Muster nichts ausgeschlossen", () => { expect(ex("", "a/b.md")).toBe(false); });
  it("Ordnername in jeder Tiefe", () => {
    expect(ex("Clippings/", "Clippings/x.md")).toBe(true);
    expect(ex("Clippings/", "A/Clippings/x.md")).toBe(true);
    expect(ex("Clippings/", "A/x.md")).toBe(false);
  });
  it("verankert mit Slash", () => {
    expect(ex("80_Archiv/alt", "80_Archiv/alt/x.md")).toBe(true);
    expect(ex("80_Archiv/alt", "B/80_Archiv/alt/x.md")).toBe(false);
  });
  it("Freigabe mit * und !Ordner/** (Review Focus 4)", () => {
    const p = "*\n!Notes/**";
    expect(ex(p, "Notes/a.md")).toBe(false);
    expect(ex(p, "Notes/Sub/a.md")).toBe(false);
    expect(ex(p, "Clippings/x.md")).toBe(true);
    expect(ex(p, "root.md")).toBe(true);
  });
  it("Dateimuster", () => { expect(ex("*.excalidraw.md", "Zeichnung.excalidraw.md")).toBe(true); });
  it("Ausnahme innerhalb eines ausgeschlossenen Ordners", () => {
    expect(ex("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/keep.md")).toBe(false);
    expect(ex("80_Archiv/\n!80_Archiv/keep.md", "80_Archiv/other.md")).toBe(true);
  });
});

describe("createExclusionCache", () => {
  it("rechnet je Pfad einmal und vergisst bei invalidate", () => {
    let calls = 0;
    const c = createExclusionCache(() => "Clippings/", (p) => { calls++; return p === "a.md" ? { ghostline: false } : undefined; });
    expect(c.isExcluded("Clippings/x.md")).toBe(true);
    expect(c.isExcluded("a.md")).toBe(true);
    expect(c.isExcluded("b.md")).toBe(false);
    expect(c.isExcluded("b.md")).toBe(false);
    expect(calls).toBe(2);
    c.invalidate();
    c.isExcluded("b.md");
    expect(calls).toBe(3);
  });
});

describe("frontmatterDisabled", () => {
  it("nur ghostline: false schaltet ab", () => {
    expect(frontmatterDisabled({ ghostline: false })).toBe(true);
    expect(frontmatterDisabled({ ghostline: "false" })).toBe(false);
    expect(frontmatterDisabled({ ghostline: true })).toBe(false);
    expect(frontmatterDisabled(undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import "../src/i18n/strings";
import { setLang, t } from "../src/vendor/kit/i18n";
import { createDebouncer, excludeDescription, parseBounded } from "../src/core/settings-input";
import { deviationDetail } from "../src/obsidian/deviation-text";
import { ghostCommandAvailable } from "../src/editor/ghost-command";
import type { ClockPort } from "../src/vendor/kit-obsidian/clock";

function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: ClockPort = {
    now: () => now,
    setTimeout: (fn, ms) => { id++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
  };
  const advance = (ms: number) => { now += ms; for (const [k, v] of [...timers]) if (v.at <= now) { timers.delete(k); v.fn(); } };
  return { clock, advance, pending: () => timers.size };
}

describe("parseBounded", () => {
  it("klemmt erst beim Übernehmen und lehnt Unbrauchbares ab", () => {
    expect(parseBounded("5", 150, 1000)).toBe(150);
    expect(parseBounded("5000", 150, 1000)).toBe(1000);
    expect(parseBounded(" 300 ", 150, 1000)).toBe(300);
    expect(parseBounded("", 150, 1000)).toBeNull();
    expect(parseBounded("abc", 150, 1000)).toBeNull();
  });
});

describe("createDebouncer", () => {
  it("speichert einmal nach der Ruhezeit, flush sofort, cancel nie", () => {
    const f = fakeClock(); let n = 0;
    const d = createDebouncer(f.clock, 400, () => { n++; });
    d.schedule(); f.advance(300); d.schedule(); f.advance(300);
    expect(n).toBe(0);
    f.advance(100);
    expect(n).toBe(1);
    d.schedule(); d.flush();
    expect(n).toBe(2);
    expect(f.pending()).toBe(0);
    d.flush();
    expect(n).toBe(2);
    d.schedule(); d.cancel(); f.advance(1000);
    expect(n).toBe(2);
  });
});

describe("excludeDescription", () => {
  it("nennt ungültige Zeilen, sonst nur die Erklärung", () => {
    setLang("en");
    expect(excludeDescription("Clippings/")).toBe(t("set.excludeDesc"));
    const bad = excludeDescription("Notes/\n**");
    expect(bad.startsWith(t("set.excludeDesc"))).toBe(true);
    expect(bad).toContain("Ignored lines");
  });
});

describe("deviationDetail", () => {
  it("zeigt in EN und DE nie die rohe Kennung", () => {
    for (const lang of ["en", "de"] as const) {
      setLang(lang);
      for (const k of ["thinking-despite-off", "empty-by-budget", "family-mismatch", "family-detected", "rejected"] as const) {
        const text = deviationDetail(k, "x");
        expect(text).not.toBe(k);
        if (k.includes("-")) expect(text).not.toContain(k);
        expect(text).not.toMatch(/^request\./);
      }
    }
    setLang("en");
  });
});

describe("ghostCommandAvailable", () => {
  it("Annehmen/Verwerfen nur mit sichtbarem Vorschlag, Jetzt-vorschlagen immer", () => {
    expect(ghostCommandAvailable("accept", null)).toBe(false);
    expect(ghostCommandAvailable("dismiss", { pos: 1, text: "a" })).toBe(true);
    expect(ghostCommandAvailable("request-now", null)).toBe(true);
  });
});

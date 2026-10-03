import { describe, expect, it } from "vitest";
import { INITIAL, nextWordLength, step, typeThrough, visible, type SuggestionState } from "../src/core/suggestion";

const showing = (full: string, anchor = 10, consumed = 0, streaming = false): SuggestionState =>
  ({ phase: "showing", anchor, full, consumed, requestId: 1, streaming });

describe("step", () => {
  it("Tippen startet den Timer", () => {
    const r = step(INITIAL, { type: "edit", from: 3, to: 3, inserted: "a" });
    expect(r.state.phase).toBe("waiting");
    expect(r.effects).toEqual([{ kind: "cancel-timer" }, { kind: "start-timer" }]);
  });
  it("Timer startet eine Anfrage mit neuer requestId", () => {
    const r = step({ ...INITIAL, phase: "waiting" }, { type: "timer-fired", cursor: 10 });
    expect(r.state).toMatchObject({ phase: "requesting", anchor: 10, requestId: 1, streaming: true });
    expect(r.effects).toEqual([{ kind: "start-request", requestId: 1, cursor: 10 }]);
  });
  it("Text zeigt den Vorschlag", () => {
    const s = { ...INITIAL, phase: "requesting" as const, anchor: 10, requestId: 1, streaming: true };
    const r = step(s, { type: "text", requestId: 1, text: "in den" });
    expect(r.state.phase).toBe("showing");
    expect(visible(r.state)).toBe("in den");
  });
  it("Text mit veralteter requestId wird ignoriert (Review Focus 2)", () => {
    const s = { ...INITIAL, phase: "requesting" as const, anchor: 10, requestId: 2, streaming: true };
    expect(step(s, { type: "text", requestId: 1, text: "alt" }).state).toEqual(s);
    expect(step(INITIAL, { type: "text", requestId: 0, text: "alt" }).state).toEqual(INITIAL);
  });
  it("Tippen während der Anfrage bricht ab", () => {
    const s = { ...INITIAL, phase: "requesting" as const, anchor: 10, requestId: 1, streaming: true };
    const r = step(s, { type: "edit", from: 10, to: 10, inserted: "x" });
    expect(r.effects).toEqual([{ kind: "cancel-timer" }, { kind: "abort-request" }, { kind: "start-timer" }]);
    expect(r.state.phase).toBe("waiting");
  });
  it("Durchtippen schrumpft den Vorschlag ohne neue Anfrage", () => {
    const r = step(showing("in den Park"), { type: "edit", from: 10, to: 10, inserted: "in" });
    expect(r.effects).toEqual([]);
    expect(r.state.anchor).toBe(12);
    expect(visible(r.state)).toBe(" den Park");
  });
  it("vollständig durchgetippt: idle und neuer Timer", () => {
    const r = step(showing("ok"), { type: "edit", from: 10, to: 10, inserted: "ok" });
    expect(r.state.phase).toBe("waiting");
    expect(r.effects).toEqual([{ kind: "start-timer" }]);
  });
  it("Abweichendes Tippen verwirft", () => {
    const r = step(showing("in den Park"), { type: "edit", from: 10, to: 10, inserted: "x" });
    expect(r.state.phase).toBe("waiting");
    expect(r.effects).toEqual([{ kind: "cancel-timer" }, { kind: "start-timer" }]);
  });
  it("Übernehmen fügt ein, bricht laufenden Stream ab und startet den Timer", () => {
    const r = step(showing("in den Park", 10, 0, true), { type: "accept", mode: "all" });
    expect(r.effects).toEqual([{ kind: "abort-request" }, { kind: "insert", at: 10, text: "in den Park" }, { kind: "start-timer" }]);
    expect(r.state.phase).toBe("waiting");
  });
  it("Wortweise übernimmt bis zum Wortende, Rest bleibt", () => {
    const r = step(showing("in den Park"), { type: "accept", mode: "word" });
    expect(r.effects).toEqual([{ kind: "insert", at: 10, text: "in" }]);
    expect(r.state).toMatchObject({ phase: "showing", anchor: 12, consumed: 2 });
    expect(visible(r.state)).toBe(" den Park");
  });
  it("Wortweise: späterer Stream-Text respektiert das Übernommene", () => {
    const s = step(showing("in den", 10, 0, true), { type: "accept", mode: "word" }).state;
    const r = step(s, { type: "text", requestId: 1, text: "in den Park" });
    expect(visible(r.state)).toBe(" den Park");
  });
  it("Escape verwirft ohne neuen Timer", () => {
    const r = step(showing("x", 10, 0, true), { type: "dismiss" });
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toEqual([{ kind: "cancel-timer" }, { kind: "abort-request" }]);
  });
  it("leeres Ende → idle", () => {
    const s = { ...INITIAL, phase: "requesting" as const, anchor: 10, requestId: 1, streaming: true };
    expect(step(s, { type: "request-ended", requestId: 1, text: "" }).state.phase).toBe("idle");
  });
  it("Fehler → idle", () => {
    const s = { ...INITIAL, phase: "requesting" as const, anchor: 10, requestId: 1, streaming: true };
    expect(step(s, { type: "request-failed", requestId: 1 }).state.phase).toBe("idle");
  });
  it("accept ohne Vorschlag tut nichts", () => {
    expect(step(INITIAL, { type: "accept", mode: "all" })).toEqual({ state: INITIAL, effects: [] });
  });
});

describe("Hilfsfunktionen", () => {
  it("typeThrough", () => {
    expect(typeThrough("in den", 10, 10, 10, "in")).toBe(" den");
    expect(typeThrough("in den", 10, 10, 10, "x")).toBeNull();
    expect(typeThrough("in den", 10, 11, 11, "n")).toBeNull();
    expect(typeThrough("in den", 10, 10, 12, "in")).toBeNull();
  });
  it("nextWordLength", () => {
    expect(nextWordLength("in den")).toBe(2);
    expect(nextWordLength(" den Park")).toBe(4);
    expect(nextWordLength("Park.")).toBe(5);
  });
  it("Randfälle: Emoji, Zeilenumbruch, nur Leerraum, längere Eingabe als Ghost", () => {
    expect(nextWordLength("\u{1F600}x y")).toBe(3);
    expect(nextWordLength("\nfoo bar")).toBe(4);
    expect(nextWordLength("  ")).toBe(2);
    expect(nextWordLength("")).toBe(0);
    expect(typeThrough("\u{1F600}ab", 5, 5, 5, "\u{1F600}")).toBe("ab");
    expect(typeThrough("ab", 5, 5, 5, "abc")).toBeNull();
    expect(typeThrough("ab", 5, 5, 5, "")).toBeNull();
  });
});

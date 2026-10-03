import { describe, expect, it } from "vitest";
import { shouldTrigger, type TriggerInput } from "../src/core/trigger";

const base: TriggerInput = { enabled: true, excluded: false, selectionEmpty: true, cursorCount: 1, lineText: "Ich gehe heute ", ch: 15, blockKind: "text", vimAllows: true, manual: false };
const run = (p: Partial<TriggerInput>) => shouldTrigger({ ...base, ...p });

describe("shouldTrigger", () => {
  it("löst nach Leerzeichen am Zeilenende aus", () => { expect(run({})).toEqual({ fire: true }); });
  it("löst nach Satzzeichen aus", () => { expect(run({ lineText: "Fertig.", ch: 7 })).toEqual({ fire: true }); });
  it("nicht mitten im Wort", () => { expect(run({ lineText: "Ich geh", ch: 7 })).toEqual({ fire: false, reason: "mid-word" }); });
  it("nicht vor weiterem Text", () => { expect(run({ lineText: "Ich gehe heute weg", ch: 9 })).toEqual({ fire: false, reason: "not-line-end" }); });
  it("Leerraum hinter dem Cursor zählt als Zeilenende", () => { expect(run({ lineText: "Ich gehe   ", ch: 9 })).toEqual({ fire: true }); });
  it("nicht auf leerem Listenpunkt", () => {
    for (const l of ["- ", "* ", "1. ", "- [ ] ", "  - "]) expect(run({ lineText: l, ch: l.length })).toEqual({ fire: false, reason: "empty-list-item" });
  });
  it("Listenpunkt mit Text löst aus", () => { expect(run({ lineText: "- Milch und ", ch: 12 })).toEqual({ fire: true }); });
  it("leere Zeile nur manuell", () => {
    expect(run({ lineText: "", ch: 0 })).toEqual({ fire: false, reason: "empty-line" });
    expect(run({ lineText: "", ch: 0, manual: true })).toEqual({ fire: true });
  });
  it("manuell auch mitten in der Zeile, aber nicht mitten im Wort", () => {
    expect(run({ lineText: "Ich gehe heute weg", ch: 9, manual: true })).toEqual({ fire: true });
    expect(run({ lineText: "Ich geh weg", ch: 7, manual: true })).toEqual({ fire: false, reason: "mid-word" });
  });
  it("Sperren in fester Reihenfolge", () => {
    expect(run({ enabled: false })).toEqual({ fire: false, reason: "disabled" });
    expect(run({ excluded: true })).toEqual({ fire: false, reason: "excluded" });
    expect(run({ selectionEmpty: false })).toEqual({ fire: false, reason: "selection" });
    expect(run({ cursorCount: 2 })).toEqual({ fire: false, reason: "multi-cursor" });
    expect(run({ vimAllows: false })).toEqual({ fire: false, reason: "vim-normal" });
    expect(run({ blockKind: "code" })).toEqual({ fire: false, reason: "block" });
  });
});

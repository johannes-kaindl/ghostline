import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ghostField, setGhost } from "../src/editor/ghost-field";

const withGhost = (doc: string, pos: number, text: string) => {
  const s = EditorState.create({ doc, selection: { anchor: pos }, extensions: [ghostField] });
  return s.update({ effects: setGhost.of({ pos, text }) }).state;
};

describe("ghostField", () => {
  it("setzt und löscht", () => {
    const s = withGhost("Ich gehe ", 9, "heute");
    expect(s.field(ghostField)).toEqual({ pos: 9, text: "heute" });
    expect(s.update({ effects: setGhost.of(null) }).state.field(ghostField)).toBeNull();
  });
  it("Durchtippen schrumpft", () => {
    const s = withGhost("Ich gehe ", 9, "heute").update({ changes: { from: 9, insert: "he" }, selection: { anchor: 11 } }).state;
    expect(s.field(ghostField)).toEqual({ pos: 11, text: "ute" });
  });
  it("abweichendes Tippen löscht", () => {
    const s = withGhost("Ich gehe ", 9, "heute").update({ changes: { from: 9, insert: "x" }, selection: { anchor: 10 } }).state;
    expect(s.field(ghostField)).toBeNull();
  });
  it("Cursor-Bewegung löscht", () => {
    const s = withGhost("Ich gehe ", 9, "heute").update({ selection: { anchor: 2 } }).state;
    expect(s.field(ghostField)).toBeNull();
  });
  it("vollständig durchgetippt löscht", () => {
    const s = withGhost("a ", 2, "ok").update({ changes: { from: 2, insert: "ok" }, selection: { anchor: 4 } }).state;
    expect(s.field(ghostField)).toBeNull();
  });
});

describe("ghostField: Auswahl", () => {
  it("nichtleere Auswahl entfernt den Ghost", () => {
    const s = EditorState.create({ doc: "Ich gehe ", selection: { anchor: 9 }, extensions: [ghostField] })
      .update({ effects: setGhost.of({ pos: 9, text: "x" }) }).state;
    expect(s.update({ selection: { anchor: 3, head: 9 } }).state.field(ghostField)).toBeNull();
  });
});

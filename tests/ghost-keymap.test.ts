import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ghostField, setGhost, ghostOwn } from "../src/editor/ghost-field";
import { keymap, type EditorView } from "@codemirror/view";
import { acceptSpec, ghostKeymap } from "../src/editor/ghost-keymap";

const st = (ghost: { pos: number; text: string } | null) => {
  const s = EditorState.create({ doc: "Ich gehe ", selection: { anchor: 9 }, extensions: [ghostField] });
  return s.update({ effects: setGhost.of(ghost) }).state;
};

describe("acceptSpec", () => {
  it("ohne Ghost null — Tab geht an Obsidian weiter (Review Focus 1)", () => {
    expect(acceptSpec(st(null), "all")).toBeNull();
  });
  it("Tab ohne Ghost gibt false zurück (auch direkt nach Verwerfen)", () => {
    let accepted = 0;
    const ext = ghostKeymap({ tabAction: () => "accept-all", vimActive: () => false, onAccept: () => { accepted++; return true; }, onDismiss: () => true });
    const base = EditorState.create({ doc: "Ich gehe ", selection: { anchor: 9 }, extensions: [ghostField, ext] });
    const tab = base.facet(keymap).flat().find((b) => b.key === "Tab")!;
    const run = (state: EditorState) => tab.run!({ state } as unknown as EditorView);
    expect(run(base)).toBe(false);
    const shown = base.update({ effects: setGhost.of({ pos: 9, text: "x" }) }).state;
    expect(run(shown)).toBe(true);
    const dismissed = shown.update({ effects: setGhost.of(null) }).state;
    expect(run(dismissed)).toBe(false);
    expect(accepted).toBe(1);
  });
  it("alles übernehmen", () => {
    const s0 = st({ pos: 9, text: "heute weg" });
    const spec = acceptSpec(s0, "all")!;
    const s1 = s0.update(spec).state;
    expect(s1.doc.toString()).toBe("Ich gehe heute weg");
    expect(s1.selection.main.head).toBe(18);
    expect(s1.field(ghostField)).toBeNull();
    expect(s0.update(spec).annotation(ghostOwn)).toBe(true);
  });
  it("Wort übernehmen lässt den Rest als Ghost", () => {
    const s0 = st({ pos: 9, text: "heute weg" });
    const s1 = s0.update(acceptSpec(s0, "word")!).state;
    expect(s1.doc.toString()).toBe("Ich gehe heute");
    expect(s1.field(ghostField)).toEqual({ pos: 14, text: " weg" });
  });
});

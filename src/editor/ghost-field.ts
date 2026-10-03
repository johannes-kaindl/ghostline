import { Annotation, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { typeThrough } from "../core/suggestion";

export interface Ghost { pos: number; text: string }

export const setGhost = StateEffect.define<Ghost | null>({
  map: (g, change) => (g ? { pos: change.mapPos(g.pos), text: g.text } : null),
});
/** Markiert Transaktionen, die Ghostline selbst auslöst (Übernahme) — die Session wertet sie
 *  nicht als Nutzereingabe. */
export const ghostOwn = Annotation.define<boolean>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: GhostWidget): boolean { return other.text === this.text; }
  toDOM(): HTMLElement {
    const span = createSpan({ cls: "ghostline-ghost", text: this.text });
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent(): boolean { return true; }
}

export const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    if (value === null) return null;
    if (tr.docChanged) {
      let single: { from: number; to: number; inserted: string } | null = null;
      let count = 0;
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => { count++; single = { from: fromA, to: toA, inserted: inserted.toString() }; });
      if (count !== 1 || single === null) return null;
      const c: { from: number; to: number; inserted: string } = single;
      const rest = typeThrough(value.text, value.pos, c.from, c.to, c.inserted);
      if (rest === null || rest === "") return null;
      const pos = value.pos + c.inserted.length;
      return tr.state.selection.main.head === pos ? { pos, text: rest } : null;
    }
    if (tr.selection && (tr.state.selection.main.head !== value.pos || !tr.state.selection.main.empty)) return null;
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (g) =>
    g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none),
});

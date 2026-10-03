import { Prec, type EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { nextWordLength } from "../core/suggestion";
import type { TabAction } from "../core/settings";
import { ghostField, ghostOwn, setGhost, type Ghost } from "./ghost-field";

/** `ghost` überschreibt das Feld: die Session übergibt, was ihr Zustand zeigt (eine Quelle der Wahrheit). */
export function acceptSpec(state: EditorState, mode: "all" | "word", ghost?: Ghost | null): TransactionSpec | null {
  const g = ghost === undefined ? state.field(ghostField, false) : ghost;
  if (!g || g.text === "") return null;
  const text = mode === "all" ? g.text : g.text.slice(0, nextWordLength(g.text));
  const rest = g.text.slice(text.length);
  const end = g.pos + text.length;
  return {
    changes: { from: g.pos, insert: text },
    selection: { anchor: end },
    effects: setGhost.of(rest ? { pos: end, text: rest } : null),
    annotations: ghostOwn.of(true),
    userEvent: "input.complete",
  };
}

export interface KeyHandlers {
  tabAction(): TabAction;
  vimActive(view: EditorView): boolean;
  onAccept(view: EditorView, mode: "all" | "word"): boolean;
  onDismiss(view: EditorView): boolean;
}

/** Reagiert nur bei sichtbarem Ghost; sonst `false`, und die Taste geht an Obsidian
 *  (Listen-Einrücken), Vim oder den Cursor weiter (Spec § 6.5). */
export function ghostKeymap(h: KeyHandlers): Extension {
  const has = (v: EditorView) => v.state.field(ghostField, false) !== null;
  return Prec.highest(keymap.of([
    { key: "Tab", run: (v) => {
      if (!has(v)) return false;
      const a = h.tabAction();
      if (a === "none") return false;
      return h.onAccept(v, a === "accept-word" ? "word" : "all");
    } },
    { key: "ArrowRight", run: (v) => (has(v) ? h.onAccept(v, "word") : false) },
    // Escape bricht immer ab (Timer, laufende Anfrage — Spec § 4 A7), verbraucht die Taste aber nur,
    // wenn ein Ghost sichtbar ist und Vim nicht aktiv ist; sonst bekommt Obsidian bzw. Vim sie.
    { key: "Escape", run: (v) => { const consume = has(v) && !h.vimActive(v); h.onDismiss(v); return consume; } },
  ]));
}

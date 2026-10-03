import type { BlockKind } from "./context-type";

export interface TriggerInput {
  enabled: boolean; excluded: boolean; selectionEmpty: boolean; cursorCount: number;
  lineText: string; ch: number; blockKind: BlockKind; vimAllows: boolean; manual: boolean;
}
export type TriggerBlock =
  | "disabled" | "excluded" | "selection" | "multi-cursor" | "not-line-end" | "mid-word"
  | "empty-line" | "empty-list-item" | "block" | "vim-normal";

const EMPTY_LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?$/;
const BOUNDARY = /[\s\p{P}]/u;

export function shouldTrigger(i: TriggerInput): { fire: true } | { fire: false; reason: TriggerBlock } {
  const no = (reason: TriggerBlock) => ({ fire: false as const, reason });
  if (!i.enabled) return no("disabled");
  if (i.excluded) return no("excluded");
  if (!i.selectionEmpty) return no("selection");
  if (i.cursorCount !== 1) return no("multi-cursor");
  if (!i.vimAllows) return no("vim-normal");
  if (i.blockKind !== "text") return no("block");
  const before = i.lineText.slice(0, i.ch);
  const after = i.lineText.slice(i.ch);
  if (before.trim() === "") return i.manual ? { fire: true } : no("empty-line");
  if (EMPTY_LIST_ITEM.test(before) && after.trim() === "") return no("empty-list-item");
  if (!i.manual && after.trim() !== "") return no("not-line-end");
  const prev = before[before.length - 1] ?? "";
  if (!BOUNDARY.test(prev)) return no("mid-word");
  return { fire: true };
}

export type Phase = "idle" | "waiting" | "requesting" | "showing";
export interface SuggestionState { phase: Phase; anchor: number; full: string; consumed: number; requestId: number; streaming: boolean }
export const INITIAL: SuggestionState = { phase: "idle", anchor: 0, full: "", consumed: 0, requestId: 0, streaming: false };

export type SuggestionEvent =
  | { type: "edit"; from: number; to: number; inserted: string }
  | { type: "other-change" }
  | { type: "timer-fired"; cursor: number }
  | { type: "trigger-rejected" }
  | { type: "text"; requestId: number; text: string }
  | { type: "request-ended"; requestId: number; text: string }
  | { type: "request-failed"; requestId: number }
  | { type: "accept"; mode: "all" | "word" }
  | { type: "dismiss" }
  | { type: "reset" };

export type Effect =
  | { kind: "start-timer" } | { kind: "cancel-timer" } | { kind: "abort-request" }
  | { kind: "start-request"; requestId: number; cursor: number }
  | { kind: "insert"; at: number; text: string };

export function visible(s: SuggestionState): string { return s.phase === "showing" ? s.full.slice(s.consumed) : ""; }

export function typeThrough(ghost: string, pos: number, from: number, to: number, inserted: string): string | null {
  if (from !== pos || to !== pos || inserted === "" || !ghost.startsWith(inserted)) return null;
  return ghost.slice(inserted.length);
}

export function nextWordLength(text: string): number {
  const m = /^\s*\S+/.exec(text);
  return m ? m[0].length : text.length;
}

const busy = (s: SuggestionState) => s.phase === "requesting" || (s.phase === "showing" && s.streaming);
const toWaiting = (s: SuggestionState): SuggestionState => ({ ...s, phase: "waiting", full: "", consumed: 0, streaming: false });
const toIdle = (s: SuggestionState): SuggestionState => ({ ...s, phase: "idle", full: "", consumed: 0, streaming: false });

export function step(s: SuggestionState, e: SuggestionEvent): { state: SuggestionState; effects: Effect[] } {
  switch (e.type) {
    case "edit": {
      if (s.phase === "showing") {
        const rest = typeThrough(visible(s), s.anchor, e.from, e.to, e.inserted);
        if (rest !== null) {
          if (rest === "" && !s.streaming) return { state: toWaiting(s), effects: [{ kind: "start-timer" }] };
          return { state: { ...s, anchor: s.anchor + e.inserted.length, consumed: s.consumed + e.inserted.length }, effects: [] };
        }
      }
      return restart(s);
    }
    case "other-change": return restart(s);
    case "timer-fired": {
      if (s.phase !== "waiting") return { state: s, effects: [] };
      const requestId = s.requestId + 1;
      return { state: { ...s, phase: "requesting", anchor: e.cursor, full: "", consumed: 0, requestId, streaming: true }, effects: [{ kind: "start-request", requestId, cursor: e.cursor }] };
    }
    case "trigger-rejected": return { state: s.phase === "waiting" ? toIdle(s) : s, effects: [] };
    case "text": {
      if (e.requestId !== s.requestId || !(s.phase === "requesting" || s.phase === "showing")) return { state: s, effects: [] };
      const phase: Phase = e.text.length > s.consumed ? "showing" : s.phase;
      return { state: { ...s, phase, full: e.text }, effects: [] };
    }
    case "request-ended": {
      if (e.requestId !== s.requestId || !(s.phase === "requesting" || s.phase === "showing")) return { state: s, effects: [] };
      if (e.text.length <= s.consumed) return { state: toIdle(s), effects: [] };
      return { state: { ...s, phase: "showing", full: e.text, streaming: false }, effects: [] };
    }
    case "request-failed": {
      if (e.requestId !== s.requestId) return { state: s, effects: [] };
      return { state: toIdle(s), effects: [] };
    }
    case "accept": {
      if (s.phase !== "showing") return { state: s, effects: [] };
      const text = visible(s);
      if (e.mode === "all") {
        const effects: Effect[] = s.streaming ? [{ kind: "abort-request" }] : [];
        effects.push({ kind: "insert", at: s.anchor, text }, { kind: "start-timer" });
        return { state: toWaiting(s), effects };
      }
      const n = nextWordLength(text);
      const insert: Effect = { kind: "insert", at: s.anchor, text: text.slice(0, n) };
      if (n >= text.length && !s.streaming) return { state: toWaiting(s), effects: [insert, { kind: "start-timer" }] };
      return { state: { ...s, anchor: s.anchor + n, consumed: s.consumed + n }, effects: [insert] };
    }
    case "dismiss": {
      const effects: Effect[] = [{ kind: "cancel-timer" }];
      if (busy(s)) effects.push({ kind: "abort-request" });
      return { state: toIdle(s), effects };
    }
    case "reset": {
      const effects: Effect[] = [{ kind: "cancel-timer" }];
      if (busy(s)) effects.push({ kind: "abort-request" });
      return { state: toIdle(s), effects };
    }
  }
}

function restart(s: SuggestionState): { state: SuggestionState; effects: Effect[] } {
  const effects: Effect[] = [{ kind: "cancel-timer" }];
  if (busy(s)) effects.push({ kind: "abort-request" });
  effects.push({ kind: "start-timer" });
  return { state: toWaiting(s), effects };
}

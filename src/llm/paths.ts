import type { ChatTiming } from "../vendor/kit-obsidian/chat-client";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { resolveRequestParams, type BackendId, type FamilyId, type RequestSettings, type ResponseFacts } from "../vendor/kit/sampling-profiles";
import type { CompletionContext } from "../core/context";
import type { FimTemplate } from "../core/fim-templates";
import { buildFimPrompt } from "../core/prompt";
import { MAX_TOKENS } from "../core/settings";
import type { FimRequest, FimResult } from "./fim-client";
import { stripThinkBlocks } from "../vendor/kit/think-splitter";

export const STOP = ["\n"];

export interface PathRequest {
  ctx: CompletionContext; endpoint: EndpointConfig; model: string;
  params: Record<string, number | string>; signal: AbortSignal; onText(raw: string): void;
  /** Familie des Modells (Manager-Tabelle, sonst Name): bei gemma4 liest der FIM-Weg den Denkkanal aus dem Completion-Text. */
  family?: FamilyId | null;
}
export type PathResult =
  | { ok: true; raw: string; timing: ChatTiming; facts: ResponseFacts }
  | { ok: false; kind: "aborted" | "network" | "timeout" | "http" | "overflow" | "truncated" | "other"; detail: string; timing?: ChatTiming };
export interface CompletionPath { readonly kind: "chat" | "fim"; request(r: PathRequest): Promise<PathResult> }

/** Anfrage-Parameter aus der Kit-Tabelle, Modus `complete`; kein fester Temperaturwert im Plugin. */
export function completeParams(input: { family: FamilyId | null; backend: BackendId; request: RequestSettings }): { params: Record<string, number | string>; offNotPossible: boolean } {
  const fam = input.family ?? "unknown";
  const thinking = input.request.thinking.complete ?? "off";
  const overrides = input.request.overrides.complete?.[fam];
  const r = resolveRequestParams({ family: input.family, mode: "complete", backend: input.backend, thinking, maxTokens: MAX_TOKENS, ...(overrides ? { overrides } : {}) });
  return { params: r.params, offNotPossible: r.explain.some((e) => e.note === "off-not-possible") };
}

export function createFimPath(fim: { complete(r: FimRequest): Promise<FimResult> }, template: FimTemplate): CompletionPath {
  return {
    kind: "fim",
    async request(r) {
      // Gemma 4 schreibt sein Denken ohne Öffner in den Text und schliesst es mit `<channel|>` (LM Studio ignoriert „none“): der
      // Vorschlag im Editor ist nur, was dahinter steht. Waehrend des Stroms ist vor dem Marker nicht erkennbar, ob Denken kommt;
      // der Text erscheint dann zunaechst und wird mit dem Marker ersetzt. Die Prueffakten behalten den Rohtext (`thinking-despite-off`).
      const channel = r.family === "gemma4";
      const lies = (text: string): string => (channel ? stripThinkBlocks(text, { channel: true }) : text);
      const res = await fim.complete({
        endpoint: r.endpoint, model: r.model, prompt: buildFimPrompt(r.ctx, template),
        params: r.params, stop: [...STOP, ...template.stop], signal: r.signal, onText: (t) => { r.onText(lies(t)); },
      });
      if (res.ok) return { ok: true, raw: lies(res.text), timing: res.timing, facts: { status: 200, content: res.text, finishReason: res.finishReason ?? null } };
      return { ok: false, kind: res.kind, detail: res.detail, timing: res.timing };
    },
  };
}

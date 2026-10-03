import type { ChatTiming } from "../vendor/kit-obsidian/chat-client";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { resolveRequestParams, type BackendId, type FamilyId, type RequestSettings, type ResponseFacts } from "../vendor/kit/sampling-profiles";
import type { CompletionContext } from "../core/context";
import type { FimTemplate } from "../core/fim-templates";
import { buildFimPrompt } from "../core/prompt";
import { MAX_TOKENS } from "../core/settings";
import type { FimRequest, FimResult } from "./fim-client";

export const STOP = ["\n"];

export interface PathRequest {
  ctx: CompletionContext; endpoint: EndpointConfig; model: string;
  params: Record<string, number | string>; signal: AbortSignal; onText(raw: string): void;
}
export type PathResult =
  | { ok: true; raw: string; timing: ChatTiming; facts: ResponseFacts }
  | { ok: false; kind: "aborted" | "network" | "timeout" | "http" | "other"; detail: string; timing?: ChatTiming };
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
      const res = await fim.complete({
        endpoint: r.endpoint, model: r.model, prompt: buildFimPrompt(r.ctx, template),
        params: r.params, stop: [...STOP, ...template.stop], signal: r.signal, onText: (t) => { r.onText(t); },
      });
      if (res.ok) return { ok: true, raw: res.text, timing: res.timing, facts: { status: 200, content: res.text, finishReason: res.finishReason ?? null } };
      return { ok: false, kind: res.kind, detail: res.detail, timing: res.timing };
    },
  };
}

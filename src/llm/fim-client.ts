/** FIM-Anfrage gegen `/v1/completions` mit Roh-Prompt — eigener schmaler Client im Plugin
 *  (Entscheidung Master 2026-10-03, n=1; Kit-Kandidat ab dem zweiten Konsumenten).
 *  Aus dem Kit übernommen (vendored, nicht kopiert): `SseTransport` und `ChatTiming`
 *  (obsidian-kit `obsidian/chat-client`), `ClockPort` (`obsidian/clock`), `authHeaders`
 *  (code-kit `pure/endpoint_config`), `normalizeEndpoint` (code-kit `pure/endpoint`).
 *  Eigen: Body-Form, `choices[0].text` (`../core/completion-sse`), Fehlerabbildung. */
import type { ChatTiming, SseTransport } from "../vendor/kit-obsidian/chat-client";
import type { ClockPort } from "../vendor/kit-obsidian/clock";
import { authHeaders, type EndpointConfig } from "../vendor/kit/endpoint_config";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { errorMessageFromText } from "../vendor/kit/error_body";
import { parseCompletionSSE } from "../core/completion-sse";

export interface FimRequest {
  endpoint: EndpointConfig; model: string; prompt: string;
  params: Record<string, unknown>; stop: string[]; signal: AbortSignal; onText(full: string): void;
}
export type FimResult =
  | { ok: true; text: string; finishReason?: string; timing: ChatTiming }
  | { ok: false; kind: "aborted" | "network" | "http"; detail: string; partial: string; status?: number; timing: ChatTiming };

const RESERVED = new Set(["model", "prompt", "stream", "stop"]);

function oneLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Servermeldung für einen Fehlerkörper: Envelope, sonst einzeiliger Rohtext, sonst nur der Status. */
function httpDetail(status: number, raw: string, bodyMayBeSuccess = false): string {
  const msg = errorMessageFromText(raw, { bodyMayBeSuccess }) ?? oneLine(raw);
  return msg === "" ? `HTTP ${status}` : `HTTP ${status}: ${msg}`;
}

/** `choices[0].text` aus einem nicht gestreamten Körper; `null`, wenn keine Completion. */
function readCompletion(raw: string): { text: string; finishReason?: string } | null {
  try {
    const j = JSON.parse(raw) as { choices?: { text?: unknown; finish_reason?: unknown }[] };
    const c0 = j.choices?.[0];
    if (typeof c0?.text !== "string") return null;
    return { text: c0.text, ...(typeof c0.finish_reason === "string" && c0.finish_reason ? { finishReason: c0.finish_reason } : {}) };
  } catch { return null; }
}

export function createFimClient(opts: { transport: SseTransport; fallbackTransport?: SseTransport; clock?: Pick<ClockPort, "now"> }) {
  const clock = opts.clock ?? { now: () => Date.now() };
  return {
    async complete(req: FimRequest): Promise<FimResult> {
      const startedAt = clock.now();
      let firstChunkAt: number | undefined;
      const timing = (): ChatTiming => ({ startedAt, ...(firstChunkAt !== undefined ? { firstChunkAt } : {}), endedAt: clock.now() });
      const url = `${normalizeEndpoint(req.endpoint.url)}/v1/completions`;
      const headers = authHeaders(req.endpoint.apiKey);
      const body = (stream: boolean): Record<string, unknown> => {
        const b: Record<string, unknown> = { model: req.model, prompt: req.prompt, stream, stop: req.stop };
        for (const [k, v] of Object.entries(req.params)) if (!RESERVED.has(k)) b[k] = v;
        return b;
      };
      let full = "";
      let raw = "";
      let buffer = "";
      let finishReason: string | undefined;
      let sawSse = false;
      const digest = (text: string): void => {
        const p = parseCompletionSSE(text);
        buffer = p.rest;
        if (!sawSse && /^\s*data:/m.test(text.slice(0, text.length - p.rest.length))) sawSse = true;
        if (p.finishReason && finishReason === undefined) finishReason = p.finishReason;
        if (p.text.length > 0) { full += p.text.join(""); req.onText(full); }
      };
      const onChunk = (chunk: string): void => {
        if (firstChunkAt === undefined) firstChunkAt = clock.now();
        raw += chunk;
        digest(buffer + chunk);
      };
      try {
        const status = await opts.transport.postStream(url, body(true), headers, onChunk, req.signal);
        if (status < 200 || status >= 300) return { ok: false, kind: "http", status, detail: httpDetail(status, raw), partial: full, timing: timing() };
        digest(buffer + "\n");
        if (!sawSse && raw.trim() !== "") {
          const done = readCompletion(raw);
          if (done === null) return { ok: false, kind: "http", status, detail: httpDetail(status, raw, true), partial: "", timing: timing() };
          req.onText(done.text);
          return { ok: true, text: done.text, ...(done.finishReason ? { finishReason: done.finishReason } : {}), timing: timing() };
        }
        return { ok: true, text: full, ...(finishReason ? { finishReason } : {}), timing: timing() };
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "AbortError") return { ok: false, kind: "aborted", detail: "aborted", partial: full, timing: timing() };
        if (name === "StreamNetworkError" && opts.fallbackTransport) {
          let text = "";
          try {
            const status = await opts.fallbackTransport.postStream(url, body(false), headers, (t) => { text += t; }, req.signal);
            if (status < 200 || status >= 300) return { ok: false, kind: "http", status, detail: httpDetail(status, text), partial: "", timing: timing() };
            const done = readCompletion(text);
            if (done === null) return { ok: false, kind: "http", status, detail: httpDetail(status, text, true), partial: "", timing: timing() };
            req.onText(done.text);
            return { ok: true, text: done.text, ...(done.finishReason ? { finishReason: done.finishReason } : {}), timing: timing() };
          } catch (e2) {
            const n2 = e2 instanceof Error ? e2.name : "";
            return { ok: false, kind: n2 === "AbortError" ? "aborted" : "network", detail: e2 instanceof Error ? e2.message : String(e2), partial: "", timing: timing() };
          }
        }
        return { ok: false, kind: "network", detail: e instanceof Error ? e.message : String(e), partial: full, timing: timing() };
      }
    },
  };
}

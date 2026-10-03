import { describe, expect, it } from "vitest";
import { createFimClient, type FimRequest } from "../src/llm/fim-client";
import type { SseTransport } from "../src/vendor/kit-obsidian/chat-client";

function fakeTransport(chunks: string[], status = 200, seen: { url?: string; body?: unknown; headers?: Record<string, string> } = {}): SseTransport {
  return {
    async postStream(url, body, headers, onChunk, signal) {
      seen.url = url; seen.body = body; seen.headers = headers;
      for (const c of chunks) {
        if (signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
        onChunk(c);
        await Promise.resolve();
      }
      return status;
    },
  };
}
const req = (over: Partial<FimRequest> = {}): FimRequest => ({
  endpoint: { url: "http://127.0.0.1:1234/v1/", apiKey: "k" }, model: "qwen2.5-coder-7b",
  prompt: "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>", params: { temperature: 0.2, max_tokens: 40 },
  stop: ["\n"], signal: new AbortController().signal, onText: () => {}, ...over,
});

describe("createFimClient", () => {
  it("postet an /v1/completions mit prompt, stream und stop", async () => {
    const seen: { url?: string; body?: unknown; headers?: Record<string, string> } = {};
    const c = createFimClient({ transport: fakeTransport(['data: {"choices":[{"text":"x"}]}\n', "data: [DONE]\n"], 200, seen) });
    const r = await c.complete(req());
    expect(seen.url).toBe("http://127.0.0.1:1234/v1/completions");
    expect(seen.body).toEqual({ model: "qwen2.5-coder-7b", prompt: "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>", stream: true, stop: ["\n"], temperature: 0.2, max_tokens: 40 });
    expect(seen.headers).toEqual({ Authorization: "Bearer k" });
    expect(r).toMatchObject({ ok: true, text: "x" });
  });
  it("meldet den wachsenden Gesamttext", async () => {
    const got: string[] = [];
    const c = createFimClient({ transport: fakeTransport(['data: {"choices":[{"text":"in"}]}\n', 'data: {"choices":[{"text":" den"}]}\n']) });
    await c.complete(req({ onText: (t) => got.push(t) }));
    expect(got).toEqual(["in", "in den"]);
  });
  it("Abbruch ergibt aborted mit Teiltext", async () => {
    const ac = new AbortController();
    const c = createFimClient({ transport: fakeTransport(['data: {"choices":[{"text":"in"}]}\n', 'data: {"choices":[{"text":" x"}]}\n']) });
    const r = await c.complete(req({ signal: ac.signal, onText: () => ac.abort() }));
    expect(r).toMatchObject({ ok: false, kind: "aborted", partial: "in" });
  });
  it("HTTP-Fehler mit Servermeldung", async () => {
    const c = createFimClient({ transport: fakeTransport(['{"error":{"message":"model not loaded"}}'], 400) });
    const r = await c.complete(req());
    expect(r).toMatchObject({ ok: false, kind: "http", status: 400 });
    if (!r.ok) expect(r.detail).toContain("model not loaded");
  });
  it("Netzfehler ohne Fallback → network", async () => {
    const t: SseTransport = { async postStream() { const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    expect(await createFimClient({ transport: t }).complete(req())).toMatchObject({ ok: false, kind: "network" });
  });
  it("Netzfehler mit Fallback: Wiederholung ohne Stream", async () => {
    const t: SseTransport = { async postStream() { const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    const seen: { body?: unknown } = {};
    const fb = fakeTransport(['{"choices":[{"text":"ok"}]}'], 200, seen);
    const r = await createFimClient({ transport: t, fallbackTransport: fb }).complete(req());
    expect(r).toMatchObject({ ok: true, text: "ok" });
    expect((seen.body as { stream: boolean }).stream).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { completeParams, createFimPath, STOP } from "../src/llm/paths";
import { createChatPath } from "../src/llm/chat-path";
import { createChatClient, type SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import { createFimClient } from "../src/llm/fim-client";
import { fimTemplateFor } from "../src/core/fim-templates";

const ctx = { title: "T", extra: "", before: "Wir fahren ", after: "" };
function capture(chunks: string[], seen: { url?: string; body?: Record<string, unknown> }): SseTransport {
  return { async postStream(url, body, _h, onChunk) { seen.url = url; seen.body = body as Record<string, unknown>; for (const c of chunks) onChunk(c); return 200; } };
}

describe("completeParams", () => {
  it("Modus complete: Denken aus, max_tokens 40", () => {
    const r = completeParams({ family: "qwen3.8", backend: "lmstudio", request: { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false } });
    expect(r.params.max_tokens).toBe(40);
    expect(r.params.reasoning_effort).toBe("none");
    expect(r.offNotPossible).toBe(false);
  });
  it("gpt-oss meldet off-not-possible", () => {
    const r = completeParams({ family: "gpt-oss", backend: "lmstudio", request: { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false } });
    expect(r.offNotPossible).toBe(true);
  });
});

describe("Chat-Weg", () => {
  it("schickt Nachrichten, stop und Profilwerte an /v1/chat/completions", async () => {
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const clock = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id: number) => clearTimeout(id) };
    const chat = createChatClient({ transport: capture(['data: {"choices":[{"delta":{"content":"morgen"}}]}\n', "data: [DONE]\n"], seen), clock });
    const r = await createChatPath(chat).request({ ctx, endpoint: { url: "http://h:1234" }, model: "m", params: { temperature: 0.2, max_tokens: 40 }, signal: new AbortController().signal, onText: () => {} });
    expect(seen.url).toBe("http://h:1234/v1/chat/completions");
    expect(seen.body?.stop).toEqual(STOP);
    expect(seen.body?.temperature).toBe(0.2);
    expect(r).toMatchObject({ ok: true, raw: "morgen" });
  });
});

describe("Chat-Weg: Fehlerarten und Denken", () => {
  const clock = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id: number) => clearTimeout(id) };
  const run = (transport: SseTransport) => {
    const texts: string[] = [];
    const p = createChatPath(createChatClient({ transport, clock })).request({ ctx, endpoint: { url: "http://h:1234" }, model: "m", params: {}, signal: new AbortController().signal, onText: (t) => texts.push(t) });
    return { p, texts };
  };
  it("overflow bleibt overflow", async () => {
    const { p } = run({ async postStream(_u, _b, _h, onChunk) { onChunk('{"error":{"message":"maximum context length exceeded"}}'); return 400; } });
    const r = await p;
    expect(r).toMatchObject({ ok: false, kind: "overflow" });
    if (!r.ok) expect(r.detail).toContain("context length");
  });
  it("truncated bleibt truncated", async () => {
    const { p } = run({ async postStream(_u, _b, _h, onChunk) { onChunk('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n'); onChunk("data: [DONE]\n"); return 200; } });
    const r = await p;
    expect(r).toMatchObject({ ok: false, kind: "truncated" });
    if (!r.ok) expect(r.detail).not.toBe("");
  });
  it("Denken im Strom gelangt nicht in den Geistertext", async () => {
    const { p, texts } = run({ async postStream(_u, _b, _h, onChunk) { onChunk('data: {"choices":[{"delta":{"content":"<think>grübel</think>morgen"}}]}\n'); onChunk("data: [DONE]\n"); return 200; } });
    const r = await p;
    expect(r).toMatchObject({ ok: true, raw: "morgen" });
    expect(texts.join("|")).not.toContain("grübel");
  });
});

describe("FIM-Weg", () => {
  it("baut den FIM-Prompt und vereinigt stop", async () => {
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const fim = createFimClient({ transport: capture(['data: {"choices":[{"text":"morgen"}]}\n'], seen) });
    const t = fimTemplateFor("qwen2.5-coder-7b")!;
    const r = await createFimPath(fim, t).request({ ctx, endpoint: { url: "http://h:1234" }, model: "qwen2.5-coder-7b", params: { max_tokens: 40 }, signal: new AbortController().signal, onText: () => {} });
    expect(seen.url).toBe("http://h:1234/v1/completions");
    expect(seen.body?.prompt).toBe("<|fim_prefix|>T\n\nWir fahren <|fim_suffix|><|fim_middle|>");
    expect(seen.body?.stop).toEqual(["\n", "<|endoftext|>", "<|fim_pad|>", "<|file_sep|>"]);
    expect(r).toMatchObject({ ok: true, raw: "morgen" });
  });
});

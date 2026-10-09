import { describe, expect, it } from "vitest";
import { completeParams, createFimPath, STOP } from "../src/llm/paths";
import { createChatPath } from "../src/llm/chat-path";
import type { SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import type { LlmConnection, LlmResult } from "../src/vendor/kit-obsidian/llm-connection";
import { buildChatMessages } from "../src/core/prompt";
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

/** Eine Verbindung, deren `complete` ein festes Ergebnis liefert (und die Aufrufe festhält). */
function fakeLlm(result: Partial<LlmResult> & { ok: boolean }, tokens: string[] = []) {
  const calls: Array<{ req: { messages?: readonly unknown[] }; h: { overrides?: Record<string, unknown>; signal?: AbortSignal } }> = [];
  const llm: Pick<LlmConnection, "complete"> = {
    async complete(req, h) {
      calls.push({ req: req as never, h: h as never });
      for (const t of tokens) h?.onToken?.(t);
      return { facts: null, deviations: [], source: {} as never, ...result } as LlmResult;
    },
  };
  return { llm, calls };
}
const timing = { startedAt: 1, firstChunkAt: 2, endedAt: 3 };
const okResult = (content: string): Partial<LlmResult> & { ok: boolean } => ({ ok: true, content, reasoning: "", toolCalls: [], truncated: false, streamed: true, timing });
const failResult = (kind: string, detail: string): Partial<LlmResult> & { ok: boolean } => ({ ok: false, kind, detail, partial: "", reasoning: "", timing } as never);

describe("Chat-Weg", () => {
  it("fragt die Verbindung mit den Chat-Nachrichten, stop je Aufruf und dem Abbruchsignal", async () => {
    const { llm, calls } = fakeLlm(okResult("morgen"), ["mor", "gen"]);
    const texts: string[] = [];
    const signal = new AbortController().signal;
    const r = await createChatPath(llm).request({ ctx, endpoint: { url: "http://h:1234" }, model: "m", params: { temperature: 0.2, max_tokens: 40 }, signal, onText: (t) => texts.push(t) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.req.messages).toEqual(buildChatMessages(ctx));
    expect(calls[0]?.h.overrides).toEqual({ stop: STOP });
    expect(calls[0]?.h.signal).toBe(signal);
    expect(texts).toEqual(["mor", "morgen"]);
    expect(r).toMatchObject({ ok: true, raw: "morgen", timing });
  });
  it("liefert die Tatsachen der Verbindung weiter, sonst baut er sie aus der Antwort", async () => {
    const facts = { status: 200, content: "x", finishReason: "stop" };
    const { llm } = fakeLlm({ ...okResult("x"), facts });
    expect(await createChatPath(llm).request({ ctx, endpoint: { url: "u" }, model: "m", params: {}, signal: new AbortController().signal, onText: () => {} })).toMatchObject({ ok: true, facts });
    const { llm: ohne } = fakeLlm({ ...okResult("y"), finishReason: "length" } as never);
    expect(await createChatPath(ohne).request({ ctx, endpoint: { url: "u" }, model: "m", params: {}, signal: new AbortController().signal, onText: () => {} })).toMatchObject({ ok: true, facts: { status: 200, content: "y", finishReason: "length" } });
  });
});

describe("Chat-Weg: Fehlerarten", () => {
  const run = (kind: string, detail: string) => createChatPath(fakeLlm(failResult(kind, detail)).llm).request({ ctx, endpoint: { url: "u" }, model: "m", params: {}, signal: new AbortController().signal, onText: () => {} });
  it.each(["overflow", "truncated", "timeout", "network", "http", "aborted"])("%s bleibt %s und trägt den Detailtext", async (kind) => {
    const r = await run(kind, "Servertext");
    expect(r).toMatchObject({ ok: false, kind, detail: "Servertext" });
  });
  it("kein Endpunkt wird zur Fehlerart other (die Session kennt nur die bekannten Arten)", async () => {
    expect(await run("no-endpoint", "disabled")).toMatchObject({ ok: false, kind: "other", detail: "disabled" });
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

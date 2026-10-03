import { describe, expect, it } from "vitest";
import { parseCompletionSSE } from "../src/core/completion-sse";

describe("parseCompletionSSE", () => {
  it("liest choices[0].text und behält die unvollständige letzte Zeile", () => {
    const r = parseCompletionSSE('data: {"choices":[{"text":"in"}]}\ndata: {"choices":[{"text":" den"}]}\ndata: {"choi');
    expect(r.text).toEqual(["in", " den"]);
    expect(r.rest).toBe('data: {"choi');
    expect(r.done).toBe(false);
  });
  it("erkennt [DONE] und finish_reason", () => {
    const r = parseCompletionSSE('data: {"choices":[{"text":"x","finish_reason":"stop"}]}\ndata: [DONE]\n');
    expect(r.finishReason).toBe("stop");
    expect(r.done).toBe(true);
  });
  it("ignoriert Kommentare und kaputte Zeilen", () => {
    expect(parseCompletionSSE(": ping\ndata: {kaputt}\n").text).toEqual([]);
  });
});

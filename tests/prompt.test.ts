import { describe, expect, it } from "vitest";
import { buildChatMessages, buildFimPrompt, CURSOR_MARK, SYSTEM_PROMPT } from "../src/core/prompt";
import { fimTemplateFor } from "../src/core/fim-templates";

const ctx = { title: "Reise", extra: "", before: "Wir fahren ", after: "\nEnde" };

describe("buildChatMessages", () => {
  it("System zuerst, stabile Teile vorn", () => {
    const m = buildChatMessages(ctx);
    expect(m[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(m[1]?.role).toBe("user");
    expect(m[1]?.content).toBe(`Note: Reise\n---\nWir fahren ${CURSOR_MARK}\nEnde`);
  });
  it("Zusatz-Kontext nur, wenn befüllt, und vor dem Text", () => {
    const m = buildChatMessages({ ...ctx, extra: "Packliste" });
    expect(m[1]?.content).toBe(`Note: Reise\nRelated notes:\nPackliste\n---\nWir fahren ${CURSOR_MARK}\nEnde`);
  });
  it("gleicher Anfang bei längerem Text (Prompt-Cache)", () => {
    const a = buildChatMessages(ctx)[1]?.content ?? "";
    const b = buildChatMessages({ ...ctx, before: "Wir fahren morgen " })[1]?.content ?? "";
    expect(b.startsWith(a.slice(0, a.indexOf(CURSOR_MARK)))).toBe(true);
  });
});

describe("FIM", () => {
  it("qwen2.5-coder-Schreibweise", () => {
    const t = fimTemplateFor("qwen2.5-coder-7b");
    expect(t).not.toBeNull();
    expect(buildFimPrompt(ctx, t!)).toBe("<|fim_prefix|>Reise\n\nWir fahren <|fim_suffix|>\nEnde<|fim_middle|>");
  });
  it("unbekanntes Modell hat keine Schreibweise", () => {
    expect(fimTemplateFor("google/gemma-4-e4b")).toBeNull();
  });
});

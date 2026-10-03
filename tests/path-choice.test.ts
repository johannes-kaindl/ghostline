import { describe, expect, it } from "vitest";
import { choosePath } from "../src/core/path-choice";

describe("choosePath", () => {
  it("auto: FIM für Modelle mit Schreibweise, sonst Chat", () => {
    expect(choosePath("auto", "qwen2.5-coder-7b").kind).toBe("fim");
    expect(choosePath("auto", "qwen/qwen3.8-27b").kind).toBe("chat");
  });
  it("chat erzwingt Chat", () => { expect(choosePath("chat", "qwen2.5-coder-7b")).toEqual({ kind: "chat", template: null }); });
  it("fim ohne Schreibweise warnt und fällt auf Chat zurück", () => {
    expect(choosePath("fim", "google/gemma-4-e4b")).toEqual({ kind: "chat", template: null, warning: "fim-unsupported" });
  });
});

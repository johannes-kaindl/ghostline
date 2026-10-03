import { describe, expect, it } from "vitest";
import { blockKindAt } from "../src/core/context-type";

const at = (doc: string, line: number, ch?: number) => {
  const lines = doc.split("\n");
  return blockKindAt(lines, line, ch ?? lines[line].length);
};

describe("blockKindAt", () => {
  it("Fließtext", () => { expect(at("Hallo Welt ", 0)).toBe("text"); });
  it("Frontmatter offen und geschlossen", () => {
    expect(at("---\ntitle: x\n---\nText ", 1)).toBe("frontmatter");
    expect(at("---\ntitle: x\n---\nText ", 3)).toBe("text");
    expect(at("---\ntitle: x", 1)).toBe("frontmatter");
  });
  it("Code-Block mit ``` und ~~~, auch die Zaunzeile selbst", () => {
    expect(at("```js\nconst a = ", 1)).toBe("code");
    expect(at("~~~\nx\n~~~\nText ", 3)).toBe("text");
    expect(at("````\n```\nnoch Code ", 2)).toBe("code");
    expect(at("```js", 0)).toBe("code");
  });
  it("Formel-Block $$", () => {
    expect(at("$$\na + ", 1)).toBe("math");
    expect(at("$$\na\n$$\nText ", 3)).toBe("text");
  });
  it("Tabelle", () => { expect(at("| a | b ", 0)).toBe("table"); });
  it("Inline-Code und Inline-Formel", () => {
    expect(at("Nimm `foo ", 0)).toBe("inline-code");
    expect(at("Nimm `foo` und ", 0)).toBe("text");
    expect(at("Es gilt $x + ", 0)).toBe("math");
    expect(at("Es gilt $x$ und ", 0)).toBe("text");
  });
  it("$5 ist keine Formel (Review Focus 3)", () => {
    expect(at("It costs $5 and ", 0)).toBe("text");
    expect(at("Preis $ 5 und ", 0)).toBe("text");
  });
});

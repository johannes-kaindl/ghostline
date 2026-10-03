import { describe, expect, it } from "vitest";
import { blockKindAt } from "../src/core/context-type";
import { buildContext } from "../src/core/context";
import { frontmatterEnd } from "../src/core/frontmatter";

const kind = (doc: string, line: number) => { const lines = doc.split("\n"); return blockKindAt(lines, line, (lines[line] ?? "").length); };
const before = (doc: string) => buildContext({ title: "t", docText: doc, cursor: doc.length, maxBefore: 1500, maxAfter: 200 }).before;

describe("eine Frontmatter-Erkennung für Kontext und Blockart (Final-Review M6)", () => {
  const cases: [string, string][] = [
    ["Leerzeichen hinter ---", "--- \nkey: geheim\n---  \nText "],
    ["CRLF", "---\r\nkey: geheim\r\n---\r\nText "],
    ["Tab hinter ---, Schluss mit ...", "---\t\nkey: geheim\n...\nText "],
  ];
  for (const [name, doc] of cases) {
    it(`${name}: Blockart und Kontext stimmen überein`, () => {
      expect(kind(doc, 1)).toBe("frontmatter");
      expect(kind(doc, 3)).toBe("text");
      expect(before(doc)).toBe("Text ");
      expect(frontmatterEnd(doc)).toBe(doc.length - "Text ".length);
    });
  }
  it("ohne Frontmatter: 0; offene Frontmatter: ganzes Dokument", () => {
    expect(frontmatterEnd("Text ---\n")).toBe(0);
    expect(frontmatterEnd(" ---\nx\n---\n")).toBe(0);
    expect(kind(" ---\nx\n---\nText", 1)).toBe("text");
    expect(frontmatterEnd("---\nkey: x")).toBe("---\nkey: x".length);
    expect(frontmatterEnd("---")).toBe(3);
  });
});

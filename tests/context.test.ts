import { describe, expect, it } from "vitest";
import { buildContext, redact, removeQueryBlocks, windowStart } from "../src/core/context";

describe("windowStart", () => {
  it("ganzer Text, wenn kurz genug", () => { expect(windowStart("abc", 10)).toBe(0); });
  it("beginnt an einer Absatzgrenze", () => {
    const t = "A".repeat(50) + "\n\n" + "B".repeat(30) + "\n\n" + "C".repeat(20);
    expect(t.slice(windowStart(t, 60))).toBe("B".repeat(30) + "\n\n" + "C".repeat(20));
  });
  it("springt blockweise, nicht zeichenweise: ein Zeichen mehr verschiebt den Anfang nicht", () => {
    const t = "A".repeat(50) + "\n\n" + "B".repeat(30) + "\n\n" + "C".repeat(20);
    expect(windowStart(t + "x", 60)).toBe(windowStart(t, 60));
  });
  it("schneidet einen überlangen Absatz an einer Satzgrenze", () => {
    const t = "Erster Satz hier. Zweiter Satz da. Dritter";
    expect(t.slice(windowStart(t, 26))).toBe("Zweiter Satz da. Dritter");
  });
  it("hart, wenn es keine Satzgrenze gibt", () => {
    expect("x".repeat(100).slice(windowStart("x".repeat(100), 10)).length).toBe(10);
  });
});

describe("removeQueryBlocks", () => {
  it("entfernt dataview, dataviewjs und base", () => {
    expect(removeQueryBlocks("a\n```dataview\nLIST\n```\nb")).toBe("a\n\nb");
    expect(removeQueryBlocks("```dataviewjs\nx\n```")).toBe("");
    expect(removeQueryBlocks("```base\nviews: []\n```\nText")).toBe("\nText");
  });
  it("lässt andere Code-Blöcke stehen", () => { expect(removeQueryBlocks("```js\nx\n```")).toBe("```js\nx\n```"); });
});

describe("redact", () => {
  it("schwärzt E-Mail, Bearer, Schlüssel-Präfixe und Private Keys", () => {
    expect(redact("mail an max@example.org bitte")).toBe("mail an [redacted-email] bitte");
    expect(redact("Bearer abcdefghijklmnop1234")).toBe("Bearer [redacted-token]");
    expect(redact("key sk-abcdefghijklmnop")).toBe("key [redacted-token]");
    expect(redact("-----BEGIN RSA PRIVATE KEY-----\nxx\n-----END RSA PRIVATE KEY-----")).toBe("[redacted-private-key]");
  });
  it("lässt normalen Text in Ruhe", () => { expect(redact("Ich gehe heute.")).toBe("Ich gehe heute."); });
});

describe("buildContext", () => {
  it("schneidet Frontmatter weg und teilt am Cursor", () => {
    const doc = "---\ntags: [a]\n---\nErster Absatz.\n\nIch gehe \nNächste Zeile";
    const cursor = doc.indexOf("Ich gehe ") + "Ich gehe ".length;
    const c = buildContext({ title: "Notiz", docText: doc, cursor, maxBefore: 1500, maxAfter: 200 });
    expect(c.before).toBe("Erster Absatz.\n\nIch gehe ");
    expect(c.after).toBe("\nNächste Zeile");
    expect(c.title).toBe("Notiz");
    expect(c.extra).toBe("");
  });
  it("kürzt den Text danach", () => {
    const c = buildContext({ title: "t", docText: "a " + "z".repeat(500), cursor: 2, maxBefore: 100, maxAfter: 200 });
    expect(c.after.length).toBe(200);
  });
  it("wendet Schwärzung und Abfrage-Entfernung an", () => {
    const doc = "```dataview\nLIST\n```\nSchreib an a@b.de und ";
    const c = buildContext({ title: "t", docText: doc, cursor: doc.length, maxBefore: 1500, maxAfter: 200 });
    expect(c.before).toBe("\nSchreib an [redacted-email] und ");
  });
  it("Private-Key-Block, der den Fensteranfang überspannt, hinterlässt keinen Schlüsseltext", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nSECRETBODY1\n\nSECRETBODY2\n-----END RSA PRIVATE KEY-----";
    const doc = "Start.\n\n" + key + "\n\nEnde davor ";
    const c = buildContext({ title: "t", docText: doc, cursor: doc.length, maxBefore: 70, maxAfter: 10 });
    expect(c.before).not.toContain("SECRETBODY");
    expect(c.before).not.toContain("PRIVATE KEY");
  });
  it("Token an der Schnittkante hinterlässt kein Fragment", () => {
    const doc = "x".repeat(50) + " sk-abcdefghijklmnopqrstuv tail ";
    const c = buildContext({ title: "t", docText: doc, cursor: doc.length, maxBefore: 20, maxAfter: 10 });
    expect(c.before).not.toContain("klmnop");
  });
  it("2-MB-Dokument: schnell und korrekt", () => {
    const body = "Ein Satz ohne Ende, ".repeat(100_000);
    const doc = body + "MITTE " + body;
    const cursor = body.length + "MITTE ".length;
    const t0 = performance.now();
    const c = buildContext({ title: "t", docText: doc, cursor, maxBefore: 1500, maxAfter: 200 });
    expect(performance.now() - t0).toBeLessThan(200);
    expect(c.after.length).toBe(200);
    expect(c.after.startsWith("Ein Satz")).toBe(true);
    expect(c.before.length).toBeLessThanOrEqual(1500);
    expect(c.before.endsWith("MITTE ")).toBe(true);
  });
  it("Key länger als der Vorlauf, END am Cursor: kein Schlüsseltext in before", () => {
    const body = ("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n").repeat(600);
    const doc = "Davor.\n\n-----BEGIN RSA PRIVATE KEY-----\n" + body + "-----END RSA PRIVATE KEY-----\nRest ";
    const c = buildContext({ title: "t", docText: doc, cursor: doc.length, maxBefore: 300, maxAfter: 10 });
    expect(c.before).not.toContain("QUJDRE");
    expect(c.before).not.toContain("PRIVATE KEY");
  });
  it("Key, dessen END hinter maxAfter+Rand liegt: kein Schlüsseltext in after", () => {
    const body = ("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n").repeat(600);
    const doc = "Vorne \n-----BEGIN RSA PRIVATE KEY-----\n" + body + "-----END RSA PRIVATE KEY-----\n";
    const c = buildContext({ title: "t", docText: doc, cursor: 6, maxBefore: 300, maxAfter: 200 });
    expect(c.after).not.toContain("QUJDRE");
    expect(c.after).not.toContain("PRIVATE KEY");
  });
  it("redact: zwei verwaiste END-Zeilen — der Teil dazwischen gehört zu einem abgeschnittenen Schlüssel und wird mitgeschwärzt (Kit-Regel, gierig)", () => {
    expect(redact("a\n-----END PRIVATE KEY-----\nb\n-----END PRIVATE KEY-----\nc")).toBe("[redacted-private-key]\nc");
  });
  it("redact: verwaiste END- und BEGIN-Hälften", () => {
    expect(redact("body\nmore\n-----END RSA PRIVATE KEY-----\nText")).toBe("[redacted-private-key]\nText");
    expect(redact("Text\n-----BEGIN PRIVATE KEY-----\nbody")).toBe("Text\n[redacted-private-key]");
  });
});

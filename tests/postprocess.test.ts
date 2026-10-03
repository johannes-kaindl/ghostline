import { describe, expect, it } from "vitest";
import { cleanCompletion } from "../src/core/postprocess";

const fin = (raw: string, before = "Ich gehe ", after = "") => cleanCompletion(raw, before, after, true);

describe("cleanCompletion", () => {
  it("lässt eine saubere Fortsetzung stehen", () => { expect(fin("in den Park.")).toBe("in den Park."); });
  it("entfernt wiederholten Satzanfang (Review Focus 5)", () => {
    expect(cleanCompletion("heute in den Park", "Ich gehe heute ", "", true)).toBe("in den Park");
    expect(cleanCompletion("Ich gehe heute in den Park", "Ich gehe heute ", "", true)).toBe("in den Park");
  });
  it("keine Überlappung mitten im Wort", () => {
    expect(cleanCompletion("gehen wir", "Ich gehe ", "", true)).toBe("gehen wir");
    expect(cleanCompletion("in den Park geh", "Ich will ", " gehen", true)).toBe("in den Park geh");
  });
  it("genau ein Leerzeichen an der Naht", () => {
    expect(fin(" in den Park")).toBe("in den Park");
    expect(cleanCompletion("Danach essen wir.", "Fertig.", "", true)).toBe(" Danach essen wir.");
    expect(cleanCompletion(", und dann", "Ich gehe", "", true)).toBe(", und dann");
  });
  it("Wiederholung ohne Leerzeichen am Ende von before: genau ein Leerzeichen", () => {
    expect(cleanCompletion("heute in den Park", "Ich gehe heute", "", true)).toBe(" in den Park");
  });
  it("nur die erste Zeile", () => { expect(fin("in den Park.\nUnd dann")).toBe("in den Park."); });
  it("entfernt Hüllen: Zäune, Anführungszeichen, Cursor-Marke", () => {
    expect(fin("```\nin den Park\n```")).toBe("in den Park");
    expect(fin("\"in den Park\"")).toBe("in den Park");
    expect(fin("„in den Park“")).toBe("in den Park");
    expect(fin("<cursor/>in den Park")).toBe("in den Park");
  });
  it("entfernt Überlappung mit dem Text danach", () => {
    expect(cleanCompletion("in den Park gehen", "Ich will ", " gehen", true)).toBe("in den Park");
  });
  it("während des Streams nur ganze Wörter", () => {
    expect(cleanCompletion("in den Pa", "Ich gehe ", "", false)).toBe("in den");
    expect(cleanCompletion("in", "Ich gehe ", "", false)).toBe("");
  });
  it("leer bleibt leer", () => { expect(fin("   ")).toBe(""); });
});

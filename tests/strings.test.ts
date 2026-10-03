import { describe, expect, it } from "vitest";
import { STRINGS } from "../src/i18n/strings";

describe("Befehlsnamen", () => {
  it("tragen den Pluginnamen nicht (Obsidian stellt ihn selbst voran, Final-Review M5)", () => {
    for (const lang of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      const cmds = Object.entries(STRINGS[lang]).filter(([k]) => k.startsWith("cmd."));
      expect(cmds.length).toBeGreaterThan(0);
      for (const [k, v] of cmds) expect(v, `${lang} ${k}`).not.toMatch(/ghostline/i);
    }
  });
});

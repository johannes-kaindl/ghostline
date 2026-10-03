import { describe, expect, it } from "vitest";
import "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";
import { statusView } from "../src/obsidian/status-item";

describe("statusView", () => {
  setLang("en");
  it("aus: eigenes Glyph, aria-pressed false", () => {
    expect(statusView({ enabled: false, kind: "ok" })).toMatchObject({ icon: "eye-off", cls: "is-off", pressed: false });
  });
  it("an: feste Vokabel je Zustand", () => {
    expect(statusView({ enabled: true, kind: "ok" })).toMatchObject({ icon: "circle-check", cls: "is-ok", pressed: true });
    expect(statusView({ enabled: true, kind: "checking" })).toMatchObject({ icon: "loader", cls: "is-checking" });
    expect(statusView({ enabled: true, kind: "error", reason: "x" })).toMatchObject({ icon: "circle-x", cls: "is-error" });
    expect(statusView({ enabled: true, kind: "warning", reason: "y" })).toMatchObject({ icon: "alert-triangle", cls: "is-warning" });
  });
  it("Label nennt Ist-Zustand, Grund und Antwortzeit", () => {
    const v = statusView({ enabled: true, kind: "ok", lastFirstWordMs: 280 });
    expect(v.label).toContain("Ghostline: on");
    expect(v.label).toContain("280");
    expect(statusView({ enabled: true, kind: "error", reason: "refused" }).label).toContain("refused");
  });
});

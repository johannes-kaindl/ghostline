import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/core/settings";

describe("normalizeSettings", () => {
  it("liefert Defaults für leere Eingabe", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt Pause und Kontextlänge in ihre Bereiche", () => {
    const s = normalizeSettings({ delayMs: 20, contextChars: 99999 });
    expect(s.delayMs).toBe(150);
    expect(s.contextChars).toBe(4000);
  });
  it("verwirft unbekannte Tab- und Pfadwerte", () => {
    const s = normalizeSettings({ tabAction: "explode", requestPath: "magic" });
    expect(s.tabAction).toBe("accept-all");
    expect(s.requestPath).toBe("auto");
  });
  it("behält gültige Werte", () => {
    const s = normalizeSettings({ enabled: false, tabAction: "none", requestPath: "fim", excludePatterns: "Clippings/\n" });
    expect(s.enabled).toBe(false);
    expect(s.tabAction).toBe("none");
    expect(s.requestPath).toBe("fim");
    expect(s.excludePatterns).toBe("Clippings/\n");
  });
  it("speichert nie eine URL oder einen Schlüssel", () => {
    const s = normalizeSettings({ choice: { endpointId: "lm", model: "m" }, url: "http://x", apiKey: "k" });
    expect(Object.keys(s)).not.toContain("url");
    expect(Object.keys(s)).not.toContain("apiKey");
    expect(s.choice).toEqual({ endpointId: "lm", model: "m" });
  });
  describe("showStatusBar (UI-STANDARD § 8 Statusleisten-Eintrag)", () => {
    it("Standard ist an", () => {
      expect(DEFAULT_SETTINGS.showStatusBar).toBe(true);
      expect(normalizeSettings(undefined).showStatusBar).toBe(true);
    });
    it("eine alte data.json ohne den Schlüssel startet mit an, ein gespeichertes aus bleibt aus", () => {
      const alt = { enabled: false, tabAction: "none", delayMs: 500 };
      expect(normalizeSettings(alt).showStatusBar).toBe(true);
      expect(normalizeSettings({ ...alt, showStatusBar: false }).showStatusBar).toBe(false);
      expect(normalizeSettings({ ...alt, showStatusBar: true }).showStatusBar).toBe(true);
    });
    it("ein Wert, der kein Boolean ist, fällt auf den Standard", () => {
      expect(normalizeSettings({ showStatusBar: "nein" }).showStatusBar).toBe(true);
      expect(normalizeSettings({ showStatusBar: null }).showStatusBar).toBe(true);
    });
  });
});

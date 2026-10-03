import { describe, expect, it } from "vitest";
import "../src/i18n/strings";
import { applyStatus, noEndpointPatch } from "../src/obsidian/status-model";
import { deviationNotice, deviationDetail } from "../src/obsidian/deviation-text";
import { t } from "../src/vendor/kit/i18n";

describe("applyStatus", () => {
  it("kappt lange Gründe bei 200 Zeichen mit Auslassungszeichen (Proxys spiegeln Prompts, Final-Review M4)", () => {
    const long = "x".repeat(500);
    const s = applyStatus({ enabled: true, kind: "ok" }, { kind: "error", reason: long }, true);
    expect(s.reason!.length).toBe(200);
    expect(s.reason!.endsWith("…")).toBe(true);
    const short = applyStatus({ enabled: true, kind: "ok" }, { kind: "error", reason: "y".repeat(200) }, true);
    expect(short.reason).toBe("y".repeat(200));
  });
  it("übernimmt den Patch und erzwingt den aktuellen enabled-Wert", () => {
    const s = applyStatus({ enabled: true, kind: "ok" }, { kind: "error", reason: "x" }, false);
    expect(s).toEqual({ enabled: false, kind: "error", reason: "x" });
  });
  it("entfernt reason, wenn der Patch ihn auf undefined setzt", () => {
    const s = applyStatus({ enabled: true, kind: "error", reason: "x" }, { kind: "ok", reason: undefined }, true);
    expect("reason" in s).toBe(false);
  });
  it("löscht ownAction bei jedem anderen Zustand", () => {
    const own = applyStatus({ enabled: true, kind: "ok" }, noEndpointPatch(), true);
    expect(own.ownAction).toBe(true);
    const next = applyStatus(own, { kind: "ok", reason: undefined }, true);
    expect(next.ownAction).toBeUndefined();
  });
  it("noEndpointPatch trägt den übersetzten Grund und die Eigenaktion", () => {
    expect(noEndpointPatch()).toEqual({ kind: "warning", reason: t("status.noEndpoint"), ownAction: true });
  });
  it("idle setzt checking auf ok zurück und lässt andere Zustände stehen", () => {
    expect(applyStatus({ enabled: true, kind: "checking" }, { kind: "ok" }, true).kind).toBe("ok");
  });
});

describe("deviationNotice", () => {
  it("nennt Abweichung und Verweis auf die Einstellungen", () => {
    expect(deviationNotice({ kind: "empty-by-budget", affectsResult: true })).toContain(t("request.dev.seeSettings"));
    expect(deviationDetail("rejected", "bad")).toContain("bad");
  });
});

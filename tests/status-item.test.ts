import { describe, expect, it } from "vitest";
import "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";
import { StatusItem, statusView } from "../src/obsidian/status-item";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";

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
  it("eigene Aktion (noEndpoint): Hinweis genau einmal, kein Umschalt-Hinweis, kein aria-pressed", () => {
    const v = statusView({ enabled: true, kind: "warning", reason: "No endpoint selected — click to open settings", ownAction: true });
    expect(v.label.match(/open settings/g)).toHaveLength(1);
    expect(v.label).not.toContain("turn off");
    expect(v.isToggle).toBe(false);
    expect(statusView({ enabled: true, kind: "ok" }).isToggle).toBe(true);
  });
});

/** Eine Statusleiste, die mitzählt: `live` sind die Einträge, die gerade hängen. */
function bar() {
  const live = new Set<ReturnType<typeof makeFakeEl>>();
  return {
    live,
    plugin: {
      addStatusBarItem() {
        const el = makeFakeEl();
        live.add(el);
        const remove = el.remove;
        el.remove = () => { live.delete(el); remove(); };
        return el;
      },
    },
  };
}

describe("StatusItem über den Kit-Baustein (Schalter showStatusBar)", () => {
  setLang("en");
  it("an: genau ein Eintrag, mit Zustand und aria-label", () => {
    const b = bar();
    const item = new StatusItem({ plugin: b.plugin, visible: true, onToggle: () => {} });
    item.render({ enabled: true, kind: "ok" });
    expect(b.live.size).toBe(1);
    expect([...b.live][0]?.getAttribute("aria-label")).toContain("Ghostline: on");
  });
  it("aus: kein Eintrag; Zustand wird trotzdem gemerkt und steht nach dem Einschalten wieder da", () => {
    const b = bar();
    const item = new StatusItem({ plugin: b.plugin, visible: false, onToggle: () => {} });
    expect(b.live.size).toBe(0);
    item.render({ enabled: true, kind: "error", reason: "refused" });
    expect(b.live.size).toBe(0);
    item.setVisible(true);
    expect(b.live.size).toBe(1);
    expect([...b.live][0]?.getAttribute("aria-label")).toContain("refused");
  });
  it("Umschalten legt nie einen zweiten Eintrag an und hängt beim Ausschalten ab", () => {
    const b = bar();
    const item = new StatusItem({ plugin: b.plugin, visible: true, onToggle: () => {} });
    item.setVisible(true);
    expect(b.live.size).toBe(1);
    item.setVisible(false);
    expect(b.live.size).toBe(0);
    item.setVisible(true);
    expect(b.live.size).toBe(1);
  });
  it("Klick am wieder angelegten Element schaltet weiter (Zuhörer in onCreate)", () => {
    const b = bar();
    let n = 0;
    const item = new StatusItem({ plugin: b.plugin, visible: true, onToggle: () => { n++; } });
    item.setVisible(false);
    item.setVisible(true);
    const el = [...b.live][0] as unknown as { click(): void; dispatchEvent(e: { type: string; key?: string; preventDefault(): void }): boolean };
    el.click();
    expect(n).toBe(1);
    el.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
    expect(n).toBe(2);
  });
});

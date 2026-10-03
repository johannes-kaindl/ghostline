// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ghostField } from "../src/editor/ghost-field";
import { REQUEST_DEADLINE_MS, ghostViewPlugin, sessionOf, type SessionDeps, type StatusSink } from "../src/obsidian/session";
import type { CompletionPath, PathRequest, PathResult } from "../src/llm/paths";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";
setLang("en");
(globalThis as unknown as { createSpan: (o: { cls: string; text: string }) => HTMLElement }).createSpan = (o) => { const el = document.createElement("span"); el.className = o.cls; el.textContent = o.text; return el; };

function fakeClock() {
  let now = 0; let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { id++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (i: number) => { timers.delete(i); },
    advance(ms: number) { now += ms; for (const [i, t] of [...timers]) if (t.at <= now) { timers.delete(i); t.fn(); } },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

type Answer = string | "fail" | { kind: "overflow" | "truncated" | "aborted" };
function setup(answer: (r: PathRequest) => Promise<Answer>) {
  const clock = fakeClock();
  const calls: PathRequest[] = [];
  const statusLog: string[] = [];
  const status: StatusSink = { checking: () => statusLog.push("checking"), ok: () => statusLog.push("ok"), error: (r) => statusLog.push(`error:${r}`), warning: (r) => statusLog.push(`warning:${r}`), noEndpoint: () => statusLog.push("noEndpoint") };
  const path: CompletionPath = { kind: "chat", async request(r) {
    calls.push(r);
    const a = await answer(r);
    if (a === "fail") return { ok: false, kind: "network", detail: "refused" };
    if (typeof a === "object") return { ok: false, kind: a.kind, detail: a.kind } as PathResult;
    r.onText(a);
    return { ok: true, raw: a, timing: { startedAt: 0, firstChunkAt: 5, endedAt: 9 }, facts: { status: 200, content: a } };
  } };
  const deps: SessionDeps = {
    clock, settings: () => DEFAULT_SETTINGS,
    target: async () => ({ endpoint: { url: "http://h" }, model: "m", family: null, backend: "lmstudio" }),
    invalidateTarget: () => {}, paths: () => path,
    fileInfo: () => ({ path: "Notiz.md", title: "Notiz" }), isExcluded: () => false,
    vimAllows: () => true, status, onFacts: () => {}, health: { until: 0, empty: 0 },
  };
  const view = new EditorView({ state: EditorState.create({ doc: "", extensions: [ghostField, ghostViewPlugin(deps)] }), parent: document.body });
  const type = (s: string) => view.dispatch({ changes: { from: view.state.doc.length, insert: s }, selection: { anchor: view.state.doc.length + s.length }, userEvent: "input.type" });
  return { clock, view, calls, statusLog, type, deps };
}

describe("GhostSession", () => {
  it("Pause löst eine Anfrage aus, Ghost erscheint", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe ");
    t.clock.advance(299); expect(t.calls.length).toBe(0);
    t.clock.advance(1); await flush();
    expect(t.calls.length).toBe(1);
    expect(t.calls[0].ctx.before).toBe("Ich gehe ");
    expect(t.view.state.field(ghostField)).toEqual({ pos: 9, text: "in den Park" });
  });
  it("Tippen bricht die laufende Anfrage ab, späte Antwort wird verworfen (Review Focus 2)", async () => {
    let release: (v: string) => void = () => {};
    const t = setup(() => new Promise((r) => { release = r; }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    const signal = t.calls[0].signal;
    t.type("x");
    expect(signal.aborted).toBe(true);
    release("zu spät"); await flush();
    expect(t.view.state.field(ghostField)).toBeNull();
  });
  it("mitten im Wort keine Anfrage", async () => {
    const t = setup(async () => "x");
    t.type("Ich geh"); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(0);
  });
  it("Übernehmen fügt ein", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(sessionOf(t.view)!.accept("all")).toBe(true);
    expect(t.view.state.doc.toString()).toBe("Ich gehe in den Park");
  });
  it("Fehler: Status error und 10 s Pause vor dem nächsten automatischen Versuch", async () => {
    const t = setup(async () => "fail");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog.some((s) => s.startsWith("error:") && s.includes("refused"))).toBe(true);
    t.type("und "); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(1);
    t.clock.advance(10_000); t.type("dann "); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(2);
  });
  it("ohne Endpunkt: noEndpoint, keine Anfrage", async () => {
    const t = setup(async () => "x");
    t.deps.target = async () => null;
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog).toContain("noEndpoint");
    expect(t.calls.length).toBe(0);
  });
  it("drei leere Antworten in Folge → Warnung", async () => {
    const t = setup(async () => "");
    for (const w of ["a ", "b ", "c "]) { t.type(w); t.clock.advance(300); await flush(); }
    expect(t.statusLog.some((s) => s.startsWith("warning:"))).toBe(true);
  });

  it("eigene Übernahme löst keine neue Anfrage aus", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    sessionOf(t.view)!.accept("all");
    t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(1);
  });
  it("Gesamtfrist: stumme Antwort wird abgebrochen und als Fehler gemeldet", async () => {
    const t = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res("fail")); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.clock.advance(REQUEST_DEADLINE_MS); await flush();
    expect(t.calls[0]!.signal.aborted).toBe(true);
    expect(t.statusLog.some((s) => s.startsWith("error:") && s.includes("timeout"))).toBe(true);
  });
  it("Abbruch durch Tippen ist kein Fehler im Status", async () => {
    const t = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res({ kind: "aborted" })); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.type("und "); await flush();
    expect(t.statusLog.some((s) => s.startsWith("error:"))).toBe(false);
  });
  it("overflow und truncated werden Warnungen, keine Fehler", async () => {
    const o = setup(async () => ({ kind: "overflow" }));
    o.type("Ich gehe "); o.clock.advance(300); await flush();
    expect(o.statusLog).toContain("warning:Context too long for the model — lower the context length in the settings");
    const tr = setup(async () => ({ kind: "truncated" }));
    tr.type("Ich gehe "); tr.clock.advance(300); await flush();
    expect(tr.statusLog).toContain("warning:This model always thinks — suggestions will be slow");
    expect(tr.statusLog.some((s) => s.startsWith("error:"))).toBe(false);
  });
  it("keine Anfrage bei nichtleerer Auswahl", async () => {
    const t = setup(async () => "x");
    t.view.dispatch({ changes: { from: 0, insert: "Ich gehe " }, selection: { anchor: 0, head: 3 }, userEvent: "input.type" });
    t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(0);
  });
  it("keine Anfrage während IME-Komposition", async () => {
    const t = setup(async () => "x");
    Object.defineProperty(t.view, "composing", { get: () => true });
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(0);
  });
  it("Vim verlässt den Insert-Modus: Vorschlag verschwindet", async () => {
    let allow = true;
    const t = setup(async () => "in den Park");
    t.deps.vimAllows = () => allow;
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.view.state.field(ghostField)).not.toBeNull();
    allow = false;
    t.view.dispatch({ selection: { anchor: t.view.state.doc.length } }); await flush();
    expect(t.view.state.field(ghostField)).toBeNull();
  });
  it("Notizwechsel räumt den Vorschlag", async () => {
    let path = "Notiz.md";
    const t = setup(async () => "in den Park");
    t.deps.fileInfo = () => ({ path, title: "x" });
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    path = "Andere.md";
    t.view.dispatch({ selection: { anchor: t.view.state.doc.length } }); await flush();
    expect(t.view.state.field(ghostField)).toBeNull();
  });
});

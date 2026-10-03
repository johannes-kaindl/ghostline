// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { ghostField, setGhost } from "../src/editor/ghost-field";
import { ghostViewPlugin, sessionOf, type SessionDeps, type StatusSink } from "../src/obsidian/session";
import type { CompletionPath, PathRequest, PathResult } from "../src/llm/paths";
import { DEFAULT_SETTINGS, REQUEST_DEADLINE_MS } from "../src/core/settings";
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
  const status: StatusSink = { checking: () => statusLog.push("checking"), ok: () => statusLog.push("ok"), error: (r) => statusLog.push(`error:${r}`), warning: (r) => statusLog.push(`warning:${r}`), noEndpoint: () => statusLog.push("noEndpoint"), idle: () => statusLog.push("idle") };
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
    vimAllows: () => true, status, onFacts: () => {}, onRequest: () => {}, health: { until: 0, empty: 0 },
  };
  const facts: unknown[] = [];
  deps.onFacts = (f) => { facts.push(f); };
  const view = new EditorView({ state: EditorState.create({ doc: "", extensions: [ghostField, ghostViewPlugin(deps)] }), parent: document.body });
  // Automatische Anfragen nur im fokussierten Bereich (Final-Review M2): jsdom kann das echte contentDOM fokussieren.
  view.focus();
  const type = (s: string) => view.dispatch({ changes: { from: view.state.doc.length, insert: s }, selection: { anchor: view.state.doc.length + s.length }, userEvent: "input.type" });
  return { clock, view, calls, statusLog, type, deps, facts };
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
    expect(t.statusLog.some((s) => s.startsWith("error:") && s.includes("timed out"))).toBe(true);
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
    expect(tr.statusLog.some((s) => s.startsWith("warning:"))).toBe(true);
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

  it("Abbruch setzt den Spinner zurück (idle), auch wenn danach nichts neu angefragt wird", async () => {
    const t = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res({ kind: "aborted" })); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog).toEqual(["checking"]);
    t.type("ha"); await flush(); // mitten im Wort: trigger-rejected, keine neue Anfrage
    t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(1);
    expect(t.statusLog[t.statusLog.length - 1]).toBe("idle");
  });
  it("Escape (dismiss) setzt den Spinner zurück", async () => {
    const t = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res({ kind: "aborted" })); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    sessionOf(t.view)!.dismiss(); await flush();
    expect(t.statusLog[t.statusLog.length - 1]).toBe("idle");
  });
  it("Fokusverlust verwirft Ghost und bricht die Anfrage ab", async () => {
    const t = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res({ kind: "aborted" })); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    const signal = t.calls[0]!.signal;
    t.view.contentDOM.blur();
    sessionOf(t.view)!.update({ transactions: [], docChanged: false, selectionSet: false, focusChanged: true } as unknown as ViewUpdate);
    await flush();
    expect(t.view.hasFocus).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(t.statusLog[t.statusLog.length - 1]).toBe("idle");
  });
  it("Fokusverlust entfernt einen sichtbaren Ghost", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.view.state.field(ghostField)).not.toBeNull();
    t.view.contentDOM.blur();
    sessionOf(t.view)!.update({ transactions: [], docChanged: false, selectionSet: false, focusChanged: true } as unknown as ViewUpdate);
    await flush();
    expect(t.view.state.field(ghostField)).toBeNull();
  });
  it("target() lehnt ab: Fehlerstatus, Pause, kein hängender Spinner", async () => {
    const t = setup(async () => "in den Park");
    t.deps.target = () => Promise.reject(new Error("boom"));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog.some((s) => s.startsWith("error:") && s.includes("boom"))).toBe(true);
    expect(t.deps.health.until).toBeGreaterThan(0);
    t.deps.target = async () => ({ endpoint: { url: "http://h" }, model: "m", family: null, backend: "lmstudio" });
    t.clock.advance(10_000); t.type("dann "); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(1);
  });
  it("Wurf in paths() wird zum Fehlerstatus, die Frist-Uhr bleibt nicht stehen", async () => {
    const t = setup(async () => "x");
    t.deps.paths = () => { throw new Error("kaputt"); };
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog.some((s) => s.startsWith("error:") && s.includes("kaputt"))).toBe(true);
    expect(t.statusLog[t.statusLog.length - 1]).not.toBe("checking");
    t.clock.advance(REQUEST_DEADLINE_MS); await flush();
    expect(t.statusLog.filter((s) => s.startsWith("error:")).length).toBe(1);
  });
  it("destroy während target() aussteht: keine Anfrage, kein Dispatch", async () => {
    let release: () => void = () => {};
    const t = setup(async () => "x");
    t.deps.target = () => new Promise((res) => { release = () => res({ endpoint: { url: "http://h" }, model: "m", family: null, backend: "lmstudio" }); });
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.view.destroy();
    const spy = vi.spyOn(t.view, "dispatch");
    release(); await flush();
    expect(t.calls.length).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(t.statusLog).not.toContain("checking");
  });
  it("Anfrage, die das Signal ignoriert: späte Antwort nach Abbruch ändert weder Status, Fakten noch Zähler", async () => {
    const resolvers: ((a: Answer) => void)[] = [];
    const t = setup(() => new Promise((res) => { resolvers.push(res); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.type("ha"); await flush(); // Abbruch, mitten im Wort → keine neue Anfrage
    resolvers[0]!(""); await flush();
    expect(t.statusLog).not.toContain("ok");
    expect(t.statusLog.some((s) => s.startsWith("warning:") || s.startsWith("error:"))).toBe(false);
    expect(t.facts.length).toBe(0);
    expect(t.deps.health.empty).toBe(0);
  });
  it("Antwort von Anfrage 1 nach Start von Anfrage 2 wird verworfen", async () => {
    const resolvers: ((a: Answer) => void)[] = [];
    const t = setup(() => new Promise((res) => { resolvers.push(res); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.type("und "); t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(2);
    resolvers[0]!("eins"); await flush();
    expect(t.view.state.field(ghostField)).toBeNull();
    expect(t.statusLog).not.toContain("ok");
    expect(t.facts.length).toBe(0);
    resolvers[1]!("zwei"); await flush();
    expect(t.view.state.field(ghostField)).toEqual({ pos: 13, text: "zwei" });
    expect(t.statusLog.filter((s) => s === "ok").length).toBe(1);
    expect(t.facts.length).toBe(1);
  });
  it("Frist läuft nach Nutzerabbruch nicht mehr als Timeout-Fehler ab", async () => {
    const resolvers: ((a: Answer) => void)[] = [];
    const t = setup(() => new Promise((res) => { resolvers.push(res); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.type("ha"); // Nutzerabbruch, Pfad antwortet noch nicht
    t.clock.advance(REQUEST_DEADLINE_MS); // die Frist wäre jetzt fällig
    resolvers[0]!({ kind: "aborted" }); await flush(); // Pfad antwortet erst NACH Fristablauf
    expect(t.statusLog.some((s) => s.startsWith("error:"))).toBe(false);
  });
  it("Pfad wirft AbortError nach eigener Frist: Timeout-Text statt unreachable", async () => {
    const t = setup((r) => new Promise((_res, rej) => { r.signal.addEventListener("abort", () => rej(new Error("AbortError"))); }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.clock.advance(REQUEST_DEADLINE_MS); await flush();
    expect(t.statusLog).toContain("error:Request timed out");
  });
  it("Übernehmen Wort für Wort: Rest bleibt, keine Abbruch- oder Neuanfrage", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(sessionOf(t.view)!.accept("word")).toBe(true);
    await flush();
    expect(t.view.state.doc.toString()).toBe("Ich gehe in");
    expect(t.view.state.field(ghostField)).toEqual({ pos: 11, text: " den Park" });
    t.clock.advance(300); await flush();
    expect(t.calls.length).toBe(1);
  });
  it("Timeout und truncated sind übersetzt und eigen formuliert", async () => {
    const t = setup(async () => ({ kind: "truncated" }));
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog).toContain("warning:The model used up its token budget on reasoning — no text left");
    const u = setup((r) => new Promise((res) => { r.signal.addEventListener("abort", () => res("fail")); }));
    u.type("Ich gehe "); u.clock.advance(300); await flush();
    u.clock.advance(REQUEST_DEADLINE_MS); await flush();
    expect(u.statusLog).toContain("error:Request timed out");
  });

  /** Steuerbarer Streaming-Pfad: `push` liefert einen Rohtext-Stand, `finish` beendet die Anfrage. */
  function streaming(t: ReturnType<typeof setup>) {
    const ctl = { req: null as PathRequest | null, finish: (_raw: string) => {} };
    t.deps.paths = () => ({ kind: "chat", request: (r) => new Promise<PathResult>((res) => {
      ctl.req = r;
      ctl.finish = (raw) => { r.onText(raw); res({ ok: true, raw, timing: { startedAt: 0, firstChunkAt: 5, endedAt: 9 }, facts: { status: 200, content: raw } }); };
    }) });
    return ctl;
  }
  it("wiederholter Satzanfang beim Streaming: nie ein Ghost mit Wiederholung, Tab fügt nichts doppelt ein (Final-Review I1)", async () => {
    const t = setup(async () => "x");
    const s = streaming(t);
    t.type("Ich gehe heute "); t.clock.advance(300); await flush();
    expect(s.req).not.toBeNull();
    const doc0 = t.view.state.doc.toString();
    for (const chunk of ["Ich ", "Ich gehe ", "Ich gehe heute "]) {
      s.req!.onText(chunk);
      const g = t.view.state.field(ghostField);
      expect(g === null || !/Ich|gehe|heute/.test(g.text), `Ghost nach ${JSON.stringify(chunk)}: ${JSON.stringify(g)}`).toBe(true);
      expect(sessionOf(t.view)!.accept("all")).toBe(false);
      expect(t.view.state.doc.toString()).toBe(doc0);
    }
    s.req!.onText("Ich gehe heute in den ");
    expect(t.view.state.field(ghostField)).toEqual({ pos: 15, text: "in den" });
    s.finish("Ich gehe heute in den Park"); await flush();
    expect(t.view.state.field(ghostField)).toEqual({ pos: 15, text: "in den Park" });
    expect(sessionOf(t.view)!.accept("all")).toBe(true);
    expect(t.view.state.doc.toString()).toBe("Ich gehe heute in den Park");
  });
  it("schrumpft der Streamtext unter das Durchgetippte, verschwindet der Ghost, Tab fügt nichts Veraltetes ein (Final-Review I1a/b/d)", async () => {
    const t = setup(async () => "x");
    const s = streaming(t);
    t.type("Ich gehe heute "); t.clock.advance(300); await flush();
    s.req!.onText("in den ");
    expect(t.view.state.field(ghostField)).toEqual({ pos: 15, text: "in den" });
    t.type("in");
    expect(t.view.state.field(ghostField)).toEqual({ pos: 17, text: " den" });
    s.req!.onText("Ich gehe heute ");
    expect(t.view.state.field(ghostField)).toBeNull();
    expect(sessionOf(t.view)!.accept("all")).toBe(false);
    expect(t.view.state.doc.toString()).toBe("Ich gehe heute in");
  });
  it("Übernahme nimmt den Text aus dem Zustand, nicht aus einem abweichenden Feld (Final-Review I1d)", async () => {
    const t = setup(async () => "in den Park");
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    t.view.dispatch({ effects: setGhost.of({ pos: 9, text: "VERALTET" }) });
    expect(sessionOf(t.view)!.accept("all")).toBe(true);
    expect(t.view.state.doc.toString()).toBe("Ich gehe in den Park");
  });
  it("meldet je Anfrage die Parameter samt Stop-Liste, nie Notiztext (Final-Review I2)", async () => {
    const t = setup(async () => "in den Park");
    const reqs: Record<string, unknown>[] = [];
    t.deps.onRequest = (p) => { reqs.push(p); };
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(reqs.length).toBe(1);
    expect(reqs[0]!.stop).toEqual(["\n"]);
    expect(JSON.stringify(reqs[0])).not.toContain("Ich gehe");
    expect(Object.keys(reqs[0]!).some((k) => /prompt|messages/.test(k))).toBe(false);
    t.type("und "); t.clock.advance(300); await flush();
    expect(reqs.length).toBe(2);
  });
  it("Abweichungen werden nach dem Status ausgewertet, damit ihre Warnung stehen bleibt (Final-Review M1)", async () => {
    const t = setup(async () => "in den Park");
    t.deps.onFacts = () => { t.statusLog.push("facts"); };
    t.type("Ich gehe "); t.clock.advance(300); await flush();
    expect(t.statusLog.indexOf("facts")).toBeGreaterThan(t.statusLog.indexOf("ok"));
    expect(t.statusLog[t.statusLog.length - 1]).toBe("facts");
  });
  it("nicht fokussierter Bereich fragt nicht automatisch an, „Jetzt vorschlagen“ schon (Final-Review M2)", async () => {
    const b = setup(async () => "in den Park");
    const sb = sessionOf(b.view)!; // sessionOf kennt nur das zuletzt registrierte Plugin
    const a = setup(async () => "in den Park"); // a.focus() nimmt b den Fokus
    expect(b.view.hasFocus).toBe(false);
    for (const x of [a, b]) { x.type("Ich gehe "); x.clock.advance(300); }
    await flush();
    expect(a.calls.length).toBe(1);
    expect(b.calls.length).toBe(0);
    expect(b.statusLog).toEqual([]);
    sb.requestNow(); await flush();
    expect(b.calls.length).toBe(1);
  });
});


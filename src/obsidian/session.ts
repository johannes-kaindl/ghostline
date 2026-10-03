import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { ClockPort } from "../vendor/kit-obsidian/clock";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import type { BackendId, FamilyId, ResponseFacts } from "../vendor/kit/sampling-profiles";
import { t } from "../vendor/kit/i18n";
import { blockKindAt } from "../core/context-type";
import { buildContext } from "../core/context";
import { choosePath } from "../core/path-choice";
import { cleanCompletion } from "../core/postprocess";
import { AFTER_CHARS, EMPTY_WARN_AFTER, ERROR_PAUSE_MS, REQUEST_DEADLINE_MS, type GhostlineSettings } from "../core/settings";
import { INITIAL, step, visible, type Effect, type SuggestionEvent, type SuggestionState } from "../core/suggestion";
import { shouldTrigger } from "../core/trigger";
import type { FimTemplate } from "../core/fim-templates";
import { ghostField, ghostOwn, setGhost } from "../editor/ghost-field";
import { acceptSpec } from "../editor/ghost-keymap";
import { completeParams, type CompletionPath } from "../llm/paths";

export interface Target { endpoint: EndpointConfig; model: string; family: FamilyId | null; backend: BackendId }
export interface StatusSink { checking(): void; ok(lastFirstWordMs?: number): void; error(reason: string): void; warning(reason: string): void; noEndpoint(): void;
  /** Setzt „checking“ zurück, wenn eine Anfrage abgebrochen wurde und kein Ergebnis folgt. */
  idle(): void }
export interface SessionDeps {
  clock: ClockPort;
  settings(): GhostlineSettings;
  target(): Promise<Target | null>;
  invalidateTarget(): void;
  paths(kind: "chat" | "fim", template: FimTemplate | null): CompletionPath;
  fileInfo(view: EditorView): { path: string; title: string } | null;
  isExcluded(path: string): boolean;
  vimAllows(view: EditorView): boolean;
  status: StatusSink;
  onFacts(facts: ResponseFacts, family: FamilyId | null): void;
  health: { until: number; empty: number };
}

export class GhostSession implements PluginValue {
  private state: SuggestionState = INITIAL;
  private timer: number | null = null;
  private abort: AbortController | null = null;
  private manualNext = false;
  private lastPath: string | null = null;
  private deadline: number | null = null;
  private checkingShown = false;
  private destroyed = false;

  constructor(private readonly view: EditorView, private readonly deps: SessionDeps) {}

  update(u: ViewUpdate): void {
    if (this.destroyed) return;
    if (u.transactions.some((tr) => tr.annotation(ghostOwn) === true)) return;
    const path = this.deps.fileInfo(this.view)?.path ?? null;
    const switched = this.lastPath !== null && path !== this.lastPath;
    this.lastPath = path;
    // IME-Komposition, Notizwechsel und Verlassen des Vim-Insert-Modus räumen den Vorschlag.
    if (this.view.composing || switched || (this.state.phase !== "idle" && !this.deps.vimAllows(this.view))) {
      this.dispatch({ type: "reset" });
      return;
    }
    if (u.docChanged) {
      const changes: { from: number; to: number; inserted: string }[] = [];
      u.changes.iterChanges((fromA, toA, _fb, _tb, ins) => { changes.push({ from: fromA, to: toA, inserted: ins.toString() }); });
      const only = changes.length === 1 ? changes[0] : undefined;
      this.dispatch(only ? { type: "edit", ...only } : { type: "other-change" });
    } else if (u.selectionSet) {
      this.dispatch({ type: "other-change" });
    }
    if (u.focusChanged && !this.view.hasFocus) this.dispatch({ type: "reset" });
  }

  accept(mode: "all" | "word"): boolean {
    const spec = acceptSpec(this.view.state, mode);
    if (!spec) return false;
    this.dispatch({ type: "accept", mode }, false);
    this.view.dispatch(spec);
    return true;
  }

  /** Bricht Timer und laufende Anfrage ab und verwirft den Vorschlag. Rückgabe: ob ein Vorschlag
   *  sichtbar war (für den Befehl „Vorschlag verwerfen“). */
  dismiss(): boolean {
    const wasVisible = visible(this.state) !== "" || this.view.state.field(ghostField, false) !== null;
    this.dispatch({ type: "dismiss" });
    return wasVisible;
  }

  requestNow(): void {
    this.manualNext = true;
    this.dispatch({ type: "other-change" });
    this.cancelTimer();
    this.onTimer();
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelTimer();
    this.abortRequest();
    this.state = INITIAL;
  }

  /** Nutzerabbruch: Anfrage und Fristuhr stoppen, einen stehengebliebenen Spinner zurücksetzen. */
  private abortRequest(): void {
    this.abort?.abort();
    this.abort = null;
    this.clearDeadline();
    this.endChecking();
  }

  private clearDeadline(): void { if (this.deadline !== null) { this.deps.clock.clearTimeout(this.deadline); this.deadline = null; } }
  private endChecking(): void { if (this.checkingShown) { this.checkingShown = false; this.deps.status.idle(); } }
  private result(): void { this.checkingShown = false; }

  private dispatch(e: SuggestionEvent, runInserts = true): void {
    const r = step(this.state, e);
    this.state = r.state;
    for (const eff of r.effects) this.run(eff, runInserts);
    if (this.state.phase === "idle" || this.state.phase === "waiting") this.clearGhostLater();
  }

  /** Das Feld räumt bei Text- und Cursoränderung selbst auf (Task 9). Für Escape, Fokusverlust und
   *  Fehler braucht es einen eigenen Dispatch — und der darf nie innerhalb von `update` laufen
   *  (CodeMirror wirft dann), deshalb über einen Microtask. */
  private clearGhostLater(): void {
    queueMicrotask(() => {
      if (this.destroyed) return;
      if (this.view.state.field(ghostField, false) !== null && visible(this.state) === "") this.view.dispatch({ effects: setGhost.of(null) });
    });
  }

  private run(eff: Effect, runInserts: boolean): void {
    switch (eff.kind) {
      case "start-timer": this.cancelTimer(); this.timer = this.deps.clock.setTimeout(() => this.onTimer(), this.deps.settings().delayMs); break;
      case "cancel-timer": this.cancelTimer(); break;
      case "abort-request": this.abortRequest(); break;
      case "start-request": void this.startRequest(eff.requestId, eff.cursor); break;
      case "insert": if (runInserts) this.view.dispatch({ changes: { from: eff.at, insert: eff.text }, annotations: ghostOwn.of(true) }); break;
    }
  }

  private cancelTimer(): void { if (this.timer !== null) { this.deps.clock.clearTimeout(this.timer); this.timer = null; } }

  private onTimer(): void {
    this.timer = null;
    const manual = this.manualNext;
    this.manualNext = false;
    const s = this.deps.settings();
    const st = this.view.state;
    const sel = st.selection;
    const head = sel.main.head;
    const line = st.doc.lineAt(head);
    const info = this.deps.fileInfo(this.view);
    const lines = st.doc.sliceString(0, line.to).split("\n");
    const verdict = shouldTrigger({
      enabled: s.enabled, excluded: info ? this.deps.isExcluded(info.path) : true,
      selectionEmpty: sel.main.empty, cursorCount: sel.ranges.length,
      lineText: line.text, ch: head - line.from, blockKind: blockKindAt(lines, line.number - 1, head - line.from),
      vimAllows: this.deps.vimAllows(this.view), manual,
    });
    if (this.view.composing || !verdict.fire || (!manual && this.deps.clock.now() < this.deps.health.until)) { this.dispatch({ type: "trigger-rejected" }); return; }
    this.dispatch({ type: "timer-fired", cursor: head });
  }

  private async startRequest(requestId: number, cursor: number): Promise<void> {
    let ac: AbortController | null = null;
    let timedOut = false;
    const stale = () => this.destroyed || requestId !== this.state.requestId || this.state.phase === "idle" || this.state.phase === "waiting";
    try {
      const s = this.deps.settings();
      const target = await this.deps.target();
      if (stale()) return;
      if (!target) { this.result(); this.deps.status.noEndpoint(); this.dispatch({ type: "request-failed", requestId }); return; }
      const info = this.deps.fileInfo(this.view);
      const ctx = buildContext({ title: info?.title ?? "", docText: this.view.state.doc.toString(), cursor, maxBefore: s.contextChars, maxAfter: AFTER_CHARS });
      const choice = choosePath(s.requestPath, target.model);
      const { params, offNotPossible } = completeParams({ family: target.family, backend: target.backend, request: s.request });
      const mine = new AbortController();
      ac = mine;
      this.abort = mine;
      this.clearDeadline();
      this.deadline = this.deps.clock.setTimeout(() => { timedOut = true; mine.abort(); }, REQUEST_DEADLINE_MS);
      this.checkingShown = true;
      this.deps.status.checking();
      const res = await this.deps.paths(choice.kind, choice.template).request({
        ctx, endpoint: target.endpoint, model: target.model, params, signal: mine.signal,
        onText: (raw) => {
          if (mine.signal.aborted || stale()) return;
          this.dispatch({ type: "text", requestId, text: cleanCompletion(raw, ctx.before, ctx.after, false) });
          this.paint(requestId);
        },
      });
      // Abbruch durch Tippen/Escape: Ergebnis verwerfen, kein Fehler, kein Status (Spec 8.3). Nur die eigene Frist zählt als Fehler.
      if (this.destroyed || (mine.signal.aborted && !timedOut) || requestId !== this.state.requestId) return;
      if (timedOut || !res.ok) {
        const kind = timedOut ? "timeout" : res.ok ? "other" : res.kind;
        if (kind === "aborted") return;
        this.fail(requestId, kind === "overflow" ? { warn: t("status.overflow") }
          : kind === "truncated" ? { warn: t("status.truncated") }
          : { error: kind === "timeout" ? t("status.timeout") : t("status.unreachable", res.ok ? "" : res.detail) });
        return;
      }
      this.deps.onFacts(res.facts, target.family);
      const text = cleanCompletion(res.raw, ctx.before, ctx.after, true);
      this.deps.health.empty = res.raw.trim() === "" ? this.deps.health.empty + 1 : 0;
      const firstMs = res.timing.firstChunkAt !== undefined ? res.timing.firstChunkAt - res.timing.startedAt : undefined;
      this.result();
      if (this.deps.health.empty >= EMPTY_WARN_AFTER) this.deps.status.warning(t("status.empty"));
      else if (offNotPossible) this.deps.status.warning(t("status.alwaysThinks"));
      else if (choice.warning === "fim-unsupported") this.deps.status.warning(t("status.fimUnsupported"));
      else this.deps.status.ok(firstMs);
      this.dispatch({ type: "request-ended", requestId, text });
      this.paint(requestId);
    } catch (e) {
      if (stale() || (ac?.signal.aborted === true && !timedOut)) return;
      this.fail(requestId, { error: t("status.unreachable", e instanceof Error ? e.message : String(e)) });
    } finally {
      if (ac !== null && this.abort === ac) { this.abort = null; this.clearDeadline(); }
    }
  }

  private fail(requestId: number, how: { warn: string } | { error: string }): void {
    this.deps.health.until = this.deps.clock.now() + ERROR_PAUSE_MS;
    this.result();
    if ("warn" in how) this.deps.status.warning(how.warn);
    else { this.deps.invalidateTarget(); this.deps.status.error(how.error); }
    this.dispatch({ type: "request-failed", requestId });
  }

  private paint(requestId: number): void {
    if (this.destroyed) return;
    if (requestId !== this.state.requestId) return;
    const text = visible(this.state);
    const head = this.view.state.selection.main.head;
    if (text === "" || head !== this.state.anchor) return;
    this.view.dispatch({ effects: setGhost.of({ pos: this.state.anchor, text }) });
  }
}

let registered: ViewPlugin<GhostSession> | null = null;

export function ghostViewPlugin(deps: SessionDeps): ViewPlugin<GhostSession> {
  const p = ViewPlugin.define((view) => new GhostSession(view, deps));
  registered = p;
  return p;
}

export function sessionOf(view: EditorView): GhostSession | null {
  return registered ? view.plugin(registered) : null;
}

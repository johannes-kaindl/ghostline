import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { ClockPort } from "../vendor/kit-obsidian/clock";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import type { BackendId, FamilyId, ResponseFacts } from "../vendor/kit/sampling-profiles";
import { t } from "../vendor/kit/i18n";
import { blockKindAt } from "../core/context-type";
import { buildContext } from "../core/context";
import { choosePath } from "../core/path-choice";
import { cleanCompletion } from "../core/postprocess";
import { AFTER_CHARS, EMPTY_WARN_AFTER, ERROR_PAUSE_MS, type GhostlineSettings } from "../core/settings";
import { INITIAL, step, visible, type Effect, type SuggestionEvent, type SuggestionState } from "../core/suggestion";
import { shouldTrigger } from "../core/trigger";
import type { FimTemplate } from "../core/fim-templates";
import { ghostField, ghostOwn, setGhost } from "../editor/ghost-field";
import { acceptSpec } from "../editor/ghost-keymap";
import { completeParams, type CompletionPath } from "../llm/paths";

/** Gesamtfrist je Anfrage. Der FIM-Client kennt weder Leerlauf- noch Erstes-Chunk-Frist; ein
 *  stummer Server würde die Session sonst ewig im Zustand „requesting“ halten. */
export const REQUEST_DEADLINE_MS = 20_000;

export interface Target { endpoint: EndpointConfig; model: string; family: FamilyId | null; backend: BackendId }
export interface StatusSink { checking(): void; ok(lastFirstWordMs?: number): void; error(reason: string): void; warning(reason: string): void; noEndpoint(): void }
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

  constructor(private readonly view: EditorView, private readonly deps: SessionDeps) {}

  update(u: ViewUpdate): void {
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

  destroy(): void { this.cancelTimer(); this.abort?.abort(); }

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
      if (this.view.state.field(ghostField, false) !== null && visible(this.state) === "") this.view.dispatch({ effects: setGhost.of(null) });
    });
  }

  private run(eff: Effect, runInserts: boolean): void {
    switch (eff.kind) {
      case "start-timer": this.cancelTimer(); this.timer = this.deps.clock.setTimeout(() => this.onTimer(), this.deps.settings().delayMs); break;
      case "cancel-timer": this.cancelTimer(); break;
      case "abort-request": this.abort?.abort(); this.abort = null; break;
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
    const s = this.deps.settings();
    const target = await this.deps.target();
    if (requestId !== this.state.requestId || this.state.phase !== "requesting") return;
    if (!target) { this.deps.status.noEndpoint(); this.dispatch({ type: "request-failed", requestId }); return; }
    const info = this.deps.fileInfo(this.view);
    const ctx = buildContext({ title: info?.title ?? "", docText: this.view.state.doc.toString(), cursor, maxBefore: s.contextChars, maxAfter: AFTER_CHARS });
    const choice = choosePath(s.requestPath, target.model);
    const { params, offNotPossible } = completeParams({ family: target.family, backend: target.backend, request: s.request });
    const ac = new AbortController();
    this.abort = ac;
    let timedOut = false;
    const deadline = this.deps.clock.setTimeout(() => { timedOut = true; ac.abort(); }, REQUEST_DEADLINE_MS);
    this.deps.status.checking();
    const res = await this.deps.paths(choice.kind, choice.template).request({
      ctx, endpoint: target.endpoint, model: target.model, params, signal: ac.signal,
      onText: (raw) => {
        if (ac.signal.aborted || requestId !== this.state.requestId) return;
        this.dispatch({ type: "text", requestId, text: cleanCompletion(raw, ctx.before, ctx.after, false) });
        this.paint(requestId);
      },
    });
    this.deps.clock.clearTimeout(deadline);
    if (this.abort === ac) this.abort = null;
    if (requestId !== this.state.requestId) return;
    // Abbruch durch Tippen/Escape: Ergebnis verwerfen, kein Fehler. Nur die eigene Frist zählt als Fehler.
    if (ac.signal.aborted && !timedOut) return;
    if (timedOut || !res.ok) {
      const kind = timedOut ? "timeout" : res.ok ? "other" : res.kind;
      if (kind === "aborted") return;
      this.deps.health.until = this.deps.clock.now() + ERROR_PAUSE_MS;
      if (kind === "overflow") this.deps.status.warning(t("status.overflow"));
      else if (kind === "truncated") this.deps.status.warning(t("status.alwaysThinks"));
      else {
        this.deps.invalidateTarget();
        this.deps.status.error(t("status.unreachable", timedOut ? "timeout" : res.ok ? "" : res.detail));
      }
      this.dispatch({ type: "request-failed", requestId });
      return;
    }
    this.deps.onFacts(res.facts, target.family);
    const text = cleanCompletion(res.raw, ctx.before, ctx.after, true);
    this.deps.health.empty = res.raw.trim() === "" ? this.deps.health.empty + 1 : 0;
    const firstMs = res.timing.firstChunkAt !== undefined ? res.timing.firstChunkAt - res.timing.startedAt : undefined;
    if (this.deps.health.empty >= EMPTY_WARN_AFTER) this.deps.status.warning(t("status.empty"));
    else if (offNotPossible) this.deps.status.warning(t("status.alwaysThinks"));
    else if (choice.warning === "fim-unsupported") this.deps.status.warning(t("status.fimUnsupported"));
    else this.deps.status.ok(firstMs);
    this.dispatch({ type: "request-ended", requestId, text });
    this.paint(requestId);
  }

  private paint(requestId: number): void {
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

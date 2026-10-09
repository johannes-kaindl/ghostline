import { MarkdownView, Plugin, editorInfoField, getLanguage, type Editor } from "obsidian";
import { EditorView } from "@codemirror/view";
import "./i18n/strings";
import { getLang, pickLang, setLang, t } from "./vendor/kit/i18n";
import { checkResponse, type FamilyId } from "./vendor/kit/sampling-profiles";
import { onEndpointManagerChanged } from "./vendor/kit-obsidian/endpoint-source";
import { requestUrlTransport, xhrSseTransport } from "./vendor/kit-obsidian/chat-transport";
import { createLlmConnection, type LlmConnection } from "./vendor/kit-obsidian/llm-connection";
import { realClock } from "./vendor/kit-obsidian/clock";
import { DEFAULT_SETTINGS, MAX_TOKENS, normalizeSettings, type GhostlineSettings } from "./core/settings";
import { createExclusionCache } from "./core/exclusion";
import { ghostCommandAvailable } from "./editor/ghost-command";
import { ghostField } from "./editor/ghost-field";
import { ghostKeymap } from "./editor/ghost-keymap";
import { createChatPath } from "./llm/chat-path";
import { createFimClient } from "./llm/fim-client";
import { createFimPath, type CompletionPath } from "./llm/paths";
import { ghostViewPlugin, sessionOf, type SessionDeps, type Target } from "./obsidian/session";
import { StatusItem, type StatusState } from "./obsidian/status-item";
import { applyStatus, noEndpointPatch } from "./obsidian/status-model";
import { GhostlineSettingTab } from "./obsidian/settings-tab";

function safeGetLanguage(): string | null { try { return getLanguage(); } catch { return null; } }

function viewOf(editor: Editor): EditorView | null {
  const cm = (editor as unknown as { cm?: unknown }).cm;
  return cm instanceof EditorView ? cm : null;
}

export default class GhostlinePlugin extends Plugin {
  settings: GhostlineSettings = DEFAULT_SETTINGS;
  /** Die LLM-Anbindung (nur über den LLM Endpoint Manager): Auflösung, Parameter, Client, Prüfung der Antwort, Settings-Abschnitte. */
  llm!: LlmConnection;
  private status!: StatusItem;
  private statusState: StatusState = { enabled: true, kind: "ok" };
  private exclusions = createExclusionCache(() => this.settings.excludePatterns, (p) => {
    const f = this.app.vault.getFileByPath(p);
    return f ? this.app.metadataCache.getFileCache(f)?.frontmatter : undefined;
  });

  async onload(): Promise<void> {
    setLang(pickLang(safeGetLanguage()));
    this.settings = normalizeSettings(await this.loadData());
    this.statusState.enabled = this.settings.enabled;
    this.exclusions.invalidate();

    this.llm = createLlmConnection({
      app: this.app,
      pluginId: this.manifest.id,
      caller: "ghostline",
      capability: "chat",
      managerOnly: true,
      mode: "complete",
      maxTokens: MAX_TOKENS,
      // Inline-Vervollständigung braucht eine schnelle Antwort (ausdrücklich, nicht der JIT-Default).
      timeouts: { idleMs: 15_000, firstChunkMs: 15_000 },
      lang: () => getLang(),
      // Eigener Kanal: die Statusleiste, nie ein `new Notice` (Plan, Global Constraints).
      notice: (text) => { this.setStatus({ kind: "warning", reason: text }); },
      getSettings: () => ({ endpoints: [], choice: this.settings.choice, request: this.settings.request }),
      // Erst in die Settings schreiben, dann speichern; `endpoints` gibt es hier nie.
      persist: (patch) => {
        if (patch.choice !== undefined) this.settings.choice = patch.choice;
        if (patch.request !== undefined) this.settings.request = patch.request;
        return this.saveData(this.settings);
      },
    });

    this.status = new StatusItem(this.addStatusBarItem(), () => { void this.onStatusClick(); });
    this.status.render(this.statusState);

    const fim = createFimClient({ transport: xhrSseTransport, fallbackTransport: requestUrlTransport });
    const deps: SessionDeps = {
      clock: realClock,
      settings: () => this.settings,
      target: () => this.target(),
      invalidateTarget: () => { this.llm.invalidate(); },
      paths: (kind, template): CompletionPath => (kind === "fim" && template ? createFimPath(fim, template) : createChatPath(this.llm)),
      fileInfo: (view) => {
        const file = view.state.field(editorInfoField, false)?.file;
        return file ? { path: file.path, title: file.basename } : null;
      },
      isExcluded: (p) => this.exclusions.isExcluded(p),
      vimAllows: (view) => {
        const vimMode = (this.app.vault as unknown as { getConfig?(k: string): unknown }).getConfig?.("vimMode") === true;
        if (!vimMode) return true;
        const cm = (view as unknown as { cm?: { state?: { vim?: { insertMode?: boolean } } } }).cm;
        return cm?.state?.vim?.insertMode === true;
      },
      status: {
        checking: () => this.setStatus({ kind: "checking", reason: undefined }),
        ok: (ms) => this.setStatus({ kind: "ok", reason: undefined, ...(ms !== undefined ? { lastFirstWordMs: ms } : {}) }),
        error: (reason) => this.setStatus({ kind: "error", reason }),
        warning: (reason) => this.setStatus({ kind: "warning", reason }),
        idle: () => { if (this.statusState.kind === "checking") this.setStatus({ kind: "ok", reason: undefined }); },
        noEndpoint: () => this.setStatus(noEndpointPatch()),
      },
      // `facts` stammt aus der Modellantwort zur Notiz: nur auswerten, nie speichern oder loggen.
      // Nur der FIM-Pfad: der Chat-Pfad meldet über die Verbindung selbst (eine Sitzung, keine Doppelmeldung).
      onFacts: (facts, family: FamilyId | null, kind) => {
        if (kind === "fim") this.llm.session.report(checkResponse({ family, thinking: this.settings.request.thinking.complete ?? "off" }, facts));
      },
      // Nur Parameter (Sampling-Felder und Stop-Liste), nie Notiztext oder Prompt.
      onRequest: (params, kind) => { if (kind === "fim") this.llm.session.recordRequest(params); },
      health: { until: 0, empty: 0 },
    };

    this.registerEditorExtension([
      ghostField,
      ghostViewPlugin(deps),
      ghostKeymap({
        tabAction: () => this.settings.tabAction,
        vimActive: () => (this.app.vault as unknown as { getConfig?(k: string): unknown }).getConfig?.("vimMode") === true,
        onAccept: (view, mode) => sessionOf(view)?.accept(mode) ?? false,
        onDismiss: (view) => sessionOf(view)?.dismiss() ?? false,
      }),
    ]);

    const editorCmd = (id: string, name: string, run: (v: EditorView) => boolean) => this.addCommand({
      id, name,
      editorCheckCallback: (checking, editor) => {
        const v = viewOf(editor);
        if (!v) return false;
        if (checking) return ghostCommandAvailable(id, v.state.field(ghostField, false) ?? null);
        return run(v);
      },
    });
    editorCmd("accept", t("cmd.accept"), (v) => sessionOf(v)?.accept("all") ?? false);
    editorCmd("accept-word", t("cmd.acceptWord"), (v) => sessionOf(v)?.accept("word") ?? false);
    editorCmd("dismiss", t("cmd.dismiss"), (v) => sessionOf(v)?.dismiss() ?? false);
    editorCmd("request-now", t("cmd.requestNow"), (v) => { sessionOf(v)?.requestNow(); return true; });
    this.addCommand({ id: "toggle", name: t("cmd.toggle"), callback: () => { void this.toggleEnabled(); } });

    this.addSettingTab(new GhostlineSettingTab(this.app, this, this.llm));

    // Der Cache merkt sich auch `false`, solange die Metadaten einer Notiz noch nicht geladen sind.
    this.registerEvent(this.app.metadataCache.on("changed", () => this.exclusions.invalidate()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.exclusions.invalidate()));
    this.registerEvent(this.app.vault.on("rename", () => this.exclusions.invalidate()));
    this.app.workspace.onLayoutReady(() => {
      this.register(onEndpointManagerChanged(this.app, () => { this.llm.invalidate(); }));
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.exclusions.invalidate();
  }

  /** Aufgelöster Endpunkt für die Anfrage; die Verbindung löst den Manager bei jedem Aufruf frisch auf. */
  async target(): Promise<Target | null> {
    try {
      const r = await this.llm.resolve();
      if (!r.config || !r.sentModel) return null;
      return { endpoint: r.config, model: r.sentModel, family: r.family, backend: r.backend };
    } catch { return null; }
  }

  private setStatus(patch: Partial<StatusState>): void {
    this.statusState = applyStatus(this.statusState, patch, this.settings.enabled);
    this.status.render(this.statusState);
  }

  private async onStatusClick(): Promise<void> {
    if (this.settings.enabled && this.statusState.ownAction === true) {
      const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
      setting?.open(); setting?.openTabById(this.manifest.id);
      return;
    }
    await this.toggleEnabled();
  }

  private async toggleEnabled(): Promise<void> { await this.setEnabled(!this.settings.enabled); }

  /** Einziger Schreibweg für „an/aus“ (Befehl, Statusleiste, Settings-Schalter): speichert,
   *  zeichnet die Statusleiste neu und räumt beim Ausschalten sichtbare Vorschläge. */
  async setEnabled(enabled: boolean): Promise<void> {
    this.settings.enabled = enabled;
    await this.saveSettings();
    this.setStatus({});
    if (!this.settings.enabled) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView) { const v = viewOf(leaf.view.editor); if (v) sessionOf(v)?.dismiss(); }
      });
    }
  }
}

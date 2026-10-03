import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type GhostlinePlugin from "../main";
import { t } from "../vendor/kit/i18n";
import { parsePatterns } from "../vendor/kit/ignore";
import { FAMILIES, BACKENDS, type FamilyId, type BackendId, type FieldExplain } from "../vendor/kit/sampling-profiles";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "../vendor/kit-obsidian/settings_walker";
import { buildEndpointSourceSection } from "../vendor/kit-obsidian/endpoint-source";
import { buildRequestSection } from "../vendor/kit-obsidian/request-section";
import type { CollapsibleStorage } from "../vendor/kit-obsidian/collapsible";
import { CONTEXT_MAX, CONTEXT_MIN, DELAY_MAX, DELAY_MIN, MAX_TOKENS, type RequestPathSetting, type TabAction } from "../core/settings";

type ItemDef = { name?: string; desc?: string; control?: { type: "toggle" | "number"; key: string; min?: number }; render?: (s: Setting) => void };
type GroupDef = { type: "group"; heading: string; items: ItemDef[] };

export class GhostlineSettingTab extends PluginSettingTab {
  private cleanupPrevious: () => void = () => {};
  private readonly collapsedState = new Map<string, boolean>();
  private readonly collapsedStorage: CollapsibleStorage = {
    getCollapsed: (k) => this.collapsedState.get(k),
    setCollapsed: (k, c) => { this.collapsedState.set(k, c); },
  };

  constructor(app: App, private readonly plugin: GhostlinePlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const groups: GroupDef[] = [
      { type: "group", heading: t("set.groupEndpoint"), items: [{ name: t("set.endpoint"), render: (s) => { this.renderEndpoint(s); } }] },
      { type: "group", heading: t("set.groupBehavior"), items: [
        { name: t("set.enabled"), desc: t("set.enabledDesc"), control: { type: "toggle", key: "enabled" } },
        { name: t("set.tab"), desc: t("set.tabDesc"), render: (s) => { this.renderDropdown<TabAction>(s, ["accept-all", "accept-word", "none"], "set.tab", () => this.plugin.settings.tabAction, (v) => { this.plugin.settings.tabAction = v; }); } },
        { name: t("set.path"), desc: t("set.pathDesc"), render: (s) => { this.renderDropdown<RequestPathSetting>(s, ["auto", "chat", "fim"], "set.path", () => this.plugin.settings.requestPath, (v) => { this.plugin.settings.requestPath = v; }); } },
        { name: t("set.delay"), desc: t("set.delayDesc"), control: { type: "number", key: "delayMs", min: DELAY_MIN } },
        { name: t("set.context"), desc: t("set.contextDesc"), control: { type: "number", key: "contextChars", min: CONTEXT_MIN } },
      ] },
      { type: "group", heading: t("set.groupExclusions"), items: [{ name: t("set.exclude"), desc: t("set.excludeDesc"), render: (s) => { this.renderExclusions(s); } }] },
      { type: "group", heading: t("set.groupRequest"), items: [{ name: t("set.groupRequest"), render: (s) => { this.renderRequest(s); } }] },
    ];
    const help = helpSettingDefinition({
      ...githubHelpUrls("ghostline"),
      texts: { name: t("set.help.name"), desc: t("set.help.desc"), openDocs: t("set.help.openDocs"), reportIssue: t("set.help.reportIssue") },
    });
    return [help, ...(groups as unknown as SettingDefinitionItem[])];
  }

  private renderDropdown<T extends string>(s: Setting, values: readonly T[], keyPrefix: string, get: () => T, set: (v: T) => void): void {
    s.addDropdown((d) => {
      for (const v of values) d.addOption(v, t(`${keyPrefix}.${v}`));
      d.setValue(get());
      d.onChange((v) => { set(v as T); void this.plugin.saveSettings(); });
    });
  }

  private renderExclusions(s: Setting): void {
    s.addTextArea((ta) => {
      ta.setValue(this.plugin.settings.excludePatterns);
      ta.inputEl.rows = 5;
      ta.inputEl.addEventListener("blur", () => {
        this.plugin.settings.excludePatterns = ta.getValue();
        void this.plugin.saveSettings().then(() => this.refreshUi());
      });
    });
    const invalid = parsePatterns(this.plugin.settings.excludePatterns).invalid;
    if (invalid.length > 0) s.setDesc(`${t("set.excludeDesc")} ${t("set.excludeInvalid", invalid.join(", "))}`);
  }

  private renderEndpoint(s: Setting): void {
    const host = settingBodyHost(s);
    buildEndpointSourceSection({
      app: this.app, containerEl: host, capability: "chat", caller: "ghostline",
      choice: () => this.plugin.settings.choice,
      setChoice: async (c) => { this.plugin.settings.choice = c; await this.plugin.saveSettings(); await this.plugin.target(); this.refreshUi(); },
      local: () => [],
      strings: {
        managed: t("src.managed"), managedDesc: t("src.managedDesc"), openManager: t("src.openManager"),
        pickEndpoint: t("src.pickEndpoint"), automatic: t("src.automatic"), model: t("set.endpoint"),
        importLocal: t("src.importLocal"), imported: (r) => t("src.imported", String(r.added.length), String(r.merged.length)), importFailed: t("src.importFailed"),
        modelHint: () => "", savedSuffix: t("src.saved"), refreshModels: t("src.refreshModels"), saveFailed: t("src.saveFailed"),
      },
      renderLocalList: () => { new Setting(host).setDesc(t("set.noManager")); },
      rerender: () => { this.refreshUi(); },
    });
  }

  private fieldStateText(e: FieldExplain): string {
    // Vorlage: lingotuner/src/obsidian/settings-tab.ts `fieldStateText` (identische Schlüssel `request.state.*`/`request.note.*`).
    const key = { "sent-effective": "request.state.sentEffective", "sent-unproven": "request.state.sentUnproven", "not-sent-ignored": "request.state.notSentIgnored", "not-sent-unsupported": "request.state.notSentUnsupported", "not-sent-unknown-family": "request.state.notSentUnknownFamily", "not-sent-no-value": "request.state.notSentNoValue" }[e.state];
    const noteKey = e.note ? { "raised-to-reserve": "request.note.raisedToReserve", "raised-to-thinking-floor": "request.note.raisedToThinkingFloor", "below-thinking-floor": "request.note.belowThinkingFloor", "off-not-possible": "request.note.offNotPossible" }[e.note] : undefined;
    return noteKey ? `${t(key)} ${t(noteKey)}` : t(key);
  }

  private renderRequest(s: Setting): void {
    const host = settingBodyHost(s);
    buildRequestSection({
      containerEl: host, modes: ["complete"],
      state: () => this.plugin.requestSectionState(),
      settings: () => this.plugin.settings.request,
      save: (r) => this.plugin.saveRequestSettings(r),
      maxTokens: () => MAX_TOKENS,
      session: this.plugin.requestSession,
      collapsedStorage: this.collapsedStorage,
      rerender: () => { this.refreshUi(); },
      strings: {
        title: t("request.title"),
        head: (family, familySource, backend, backendSource) => {
          const famLabel = family === "—" ? "—" : (FAMILIES[family as FamilyId]?.label ?? family);
          const backLabel = backend === "unknown" ? t("request.backendSource.none") : (BACKENDS[backend as BackendId]?.label ?? backend);
          return t("request.head", famLabel, t(`request.familySource.${familySource}`), backLabel, t(`request.backendSource.${backendSource}`));
        },
        unknownFamily: t("request.unknownFamily"),
        jitWarning: (model, defaultModel) => t("request.jitWarning", model, defaultModel),
        sentAs: (model) => t("request.sentAs", model),
        modeHeading: (mode) => t(`request.mode.${mode}`),
        fieldName: (field) => t(`request.field.${field}`),
        fieldDesc: (e) => this.fieldStateText(e),
        reset: t("request.reset"),
        thinkingLevel: t("request.thinkingLevel"),
        level: (l) => t(`request.level.${l}`),
        levelPicker: t("request.levelPicker"),
        levelPickerDesc: t("request.levelPickerDesc"),
        dormant: (fam) => t("request.dormant", fam === "unknown" ? t("request.familySource.none") : (FAMILIES[fam]?.label ?? fam)),
        deleteDormant: t("request.deleteDormant"),
        lastRequest: t("request.lastRequest"),
        lastRequestNone: t("request.lastRequestNone"),
        copy: t("request.copy"),
        copied: t("request.copied"),
        deviationsOk: t("request.deviationsOk"),
        deviationsWarn: (n) => t("request.deviationsWarn", String(n)),
        deviation: (kind, count, detail) => `${kind}${detail ? `: ${detail}` : ""} (${count}×)`,
      },
    });
  }

  display(): void { this.renderImperative(); }
  private refreshUi(): void { refreshSettingsTab(this, () => this.renderImperative()); }
  private renderImperative(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  getControlValue(key: string): string | number | boolean | undefined {
    const s = this.plugin.settings;
    if (key === "enabled") return s.enabled;
    if (key === "delayMs") return s.delayMs;
    if (key === "contextChars") return s.contextChars;
    return undefined;
  }

  setControlValue(key: string, value: unknown): void {
    const s = this.plugin.settings;
    const n = Number.parseInt(String(value), 10);
    if (key === "enabled") { void this.plugin.setEnabled(Boolean(value)); return; }
    else if (key === "delayMs" && Number.isFinite(n)) s.delayMs = Math.min(DELAY_MAX, Math.max(DELAY_MIN, n));
    else if (key === "contextChars" && Number.isFinite(n)) s.contextChars = Math.min(CONTEXT_MAX, Math.max(CONTEXT_MIN, n));
    else return;
    void this.plugin.saveSettings();
  }
}

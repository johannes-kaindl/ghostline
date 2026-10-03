import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type GhostlinePlugin from "../main";
import { t } from "../vendor/kit/i18n";
import { createDebouncer, excludeDescription, parseBounded } from "../core/settings-input";
import { deviationDetail } from "./deviation-text";
import { realClock } from "../vendor/kit-obsidian/clock";
import { FAMILIES, BACKENDS, type FamilyId, type BackendId, type FieldExplain } from "../vendor/kit/sampling-profiles";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab, installTabRefreshOnOpen } from "../vendor/kit-obsidian/settings_walker";
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

  private uninstallRefresh: () => void = () => {};
  /** Ausstehende Muster-Speicherung; `hide()` und jeder Neuaufbau führen sie vorher aus. */
  private readonly patternSave = createDebouncer(realClock, 400, () => { void this.plugin.saveSettings(); });

  constructor(app: App, private readonly plugin: GhostlinePlugin) {
    super(app, plugin);
    // Ab Obsidian 1.13 zeichnet renderTab() bei gleicher Zeilenzahl nicht neu; ohne den Hook
    // blieben „kein Manager“-Hinweis und „Letzte Anfrage“ veraltet.
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => this.renderImperative());
  }

  hide(): void { this.patternSave.flush(); this.uninstallRefresh(); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const groups: GroupDef[] = [
      { type: "group", heading: t("set.groupEndpoint"), items: [{ name: t("set.endpoint"), render: (s) => { this.renderEndpoint(s); } }] },
      { type: "group", heading: t("set.groupBehavior"), items: [
        { name: t("set.enabled"), desc: t("set.enabledDesc"), control: { type: "toggle", key: "enabled" } },
        { name: t("set.tab"), desc: t("set.tabDesc"), render: (s) => { this.renderDropdown<TabAction>(s, ["accept-all", "accept-word", "none"], "set.tab", () => this.plugin.settings.tabAction, (v) => { this.plugin.settings.tabAction = v; }); } },
        { name: t("set.path"), desc: t("set.pathDesc"), render: (s) => { this.renderDropdown<RequestPathSetting>(s, ["auto", "chat", "fim"], "set.path", () => this.plugin.settings.requestPath, (v) => { this.plugin.settings.requestPath = v; }); } },
        { name: t("set.delay"), desc: t("set.delayDesc", String(DELAY_MIN), String(DELAY_MAX)), render: (s) => { this.renderNumber(s, "delayMs", DELAY_MIN, DELAY_MAX); } },
        { name: t("set.context"), desc: t("set.contextDesc", String(CONTEXT_MIN), String(CONTEXT_MAX)), render: (s) => { this.renderNumber(s, "contextChars", CONTEXT_MIN, CONTEXT_MAX); } },
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
    s.setDesc(excludeDescription(this.plugin.settings.excludePatterns));
    s.addTextArea((ta) => {
      ta.setValue(this.plugin.settings.excludePatterns);
      ta.inputEl.rows = 5;
      // Speichern beim Tippen (entprellt) und beim Verlassen; der Tab wird NICHT neu gebaut,
      // sonst ginge ein Klick auf das nächste Feld verloren. Nur die Beschreibung ändert sich.
      ta.inputEl.addEventListener("input", () => {
        this.plugin.settings.excludePatterns = ta.getValue();
        s.setDesc(excludeDescription(ta.getValue()));
        this.patternSave.schedule();
      });
      ta.inputEl.addEventListener("change", () => { this.patternSave.flush(); });
    });
  }

  private renderNumber(s: Setting, key: "delayMs" | "contextChars", min: number, max: number): void {
    s.addText((tx) => {
      tx.setValue(String(this.plugin.settings[key]));
      tx.inputEl.inputMode = "numeric";
      // Übernommen wird beim Bestätigen (change), nicht je Tastendruck; danach zeigt das Feld den geklemmten Wert.
      tx.inputEl.addEventListener("change", () => {
        const n = parseBounded(tx.getValue(), min, max);
        if (n !== null) { this.plugin.settings[key] = n; void this.plugin.saveSettings(); }
        tx.setValue(String(this.plugin.settings[key]));
      });
    });
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
        deviation: (kind, count, detail) => `${deviationDetail(kind, detail)} (${count}×)`,
      },
    });
  }

  display(): void { this.renderImperative(); }
  private refreshUi(): void { refreshSettingsTab(this, () => this.renderImperative()); }
  private renderImperative(): void {
    this.patternSave.flush();
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  getControlValue(key: string): string | number | boolean | undefined {
    return key === "enabled" ? this.plugin.settings.enabled : undefined;
  }

  setControlValue(key: string, value: unknown): void {
    if (key === "enabled") void this.plugin.setEnabled(Boolean(value));
  }
}

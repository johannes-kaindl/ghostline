import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type GhostlinePlugin from "../main";
import { getLang, t } from "../vendor/kit/i18n";
import { createDebouncer, excludeDescription, parseBounded } from "../core/settings-input";
import { realClock } from "../vendor/kit-obsidian/clock";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import { renderSettingDefinitions, settingBodyHost, installTabRefreshOnOpen } from "../vendor/kit-obsidian/settings_walker";
import type { LlmConnection } from "../vendor/kit-obsidian/llm-connection";
import { CONTEXT_MAX, CONTEXT_MIN, DELAY_MAX, DELAY_MIN, type RequestPathSetting, type TabAction } from "../core/settings";

type ItemDef = { name?: string; desc?: string; control?: { type: "toggle" | "number"; key: string; min?: number }; render?: (s: Setting) => void };
type GroupDef = { type: "group"; heading: string; items: ItemDef[] };

export class GhostlineSettingTab extends PluginSettingTab {
  private cleanupPrevious: () => void = () => {};
  private uninstallRefresh: () => void = () => {};
  /** Ausstehende Muster-Speicherung; `hide()` und jeder Neuaufbau führen sie vorher aus. */
  private readonly patternSave = createDebouncer(realClock, 400, () => { void this.plugin.saveSettings(); });

  constructor(app: App, private readonly plugin: GhostlinePlugin, private readonly llm: LlmConnection) {
    super(app, plugin);
    this.installRefresh();
  }

  /** Ab Obsidian 1.13 zeichnet renderTab() bei gleicher Zeilenzahl nicht neu; ohne den Hook
   *  blieben „kein Manager“-Hinweis und „Letzte Anfrage“ veraltet. Idempotent: entfernt erst den
   *  vorigen Hook. `hide()` entfernt ihn NICHT — ab 1.13 ruft das Öffnen `renderTab()` und nicht
   *  `display()`; ein in `hide()` entfernter Hook käme beim zweiten Öffnen nie zurück (Final-Review M3). */
  private installRefresh(): void {
    this.uninstallRefresh();
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => this.renderImperative());
  }

  hide(): void { this.patternSave.flush(); this.llm.hideSettings(); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const groups: GroupDef[] = [
      { type: "group", heading: t("set.groupEndpoint"), items: [{ name: t("set.endpoint"), render: (s) => { this.llm.renderSettings(settingBodyHost(s), { lang: getLang(), endpointSource: { managedDesc: t("set.managedDesc") } }); } }] },
      { type: "group", heading: t("set.groupBehavior"), items: [
        { name: t("set.enabled"), desc: t("set.enabledDesc"), control: { type: "toggle", key: "enabled" } },
        { name: t("set.tab"), desc: t("set.tabDesc"), render: (s) => { this.renderDropdown<TabAction>(s, ["accept-all", "accept-word", "none"], "set.tab", () => this.plugin.settings.tabAction, (v) => { this.plugin.settings.tabAction = v; }); } },
        { name: t("set.path"), desc: t("set.pathDesc"), render: (s) => { this.renderDropdown<RequestPathSetting>(s, ["auto", "chat", "fim"], "set.path", () => this.plugin.settings.requestPath, (v) => { this.plugin.settings.requestPath = v; }); } },
        { name: t("set.delay"), desc: t("set.delayDesc", String(DELAY_MIN), String(DELAY_MAX)), render: (s) => { this.renderNumber(s, "delayMs", DELAY_MIN, DELAY_MAX); } },
        { name: t("set.context"), desc: t("set.contextDesc", String(CONTEXT_MIN), String(CONTEXT_MAX)), render: (s) => { this.renderNumber(s, "contextChars", CONTEXT_MIN, CONTEXT_MAX); } },
      ] },
      { type: "group", heading: t("set.groupExclusions"), items: [{ name: t("set.exclude"), desc: t("set.excludeDesc"), render: (s) => { this.renderExclusions(s); } }] },
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

  display(): void { this.installRefresh(); this.renderImperative(); }
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

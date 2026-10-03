import { Plugin, getLanguage } from "obsidian";
import "./i18n/strings";
import { pickLang, setLang } from "./vendor/kit/i18n";
import { normalizeSettings, type GhostlineSettings, DEFAULT_SETTINGS } from "./core/settings";

function safeGetLanguage(): string | null {
  try { return getLanguage(); } catch { return null; }
}

export default class GhostlinePlugin extends Plugin {
  settings: GhostlineSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    setLang(pickLang(safeGetLanguage()));
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
}

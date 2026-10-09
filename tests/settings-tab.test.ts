import { describe, expect, it, vi } from "vitest";
import { PluginSettingTab, type App } from "obsidian";
import "../src/i18n/strings";
import { GhostlineSettingTab } from "../src/obsidian/settings-tab";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type GhostlinePlugin from "../src/main";
import type { LlmConnection } from "../src/vendor/kit-obsidian/llm-connection";

describe("GhostlineSettingTab", () => {
  it("Refresh-Hook greift auch beim zweiten Öffnen nach hide() (Obsidian 1.13+: Öffnen ruft renderTab, Final-Review M3)", () => {
    const proto = PluginSettingTab.prototype as unknown as { renderTab?: () => void };
    let native = 0;
    proto.renderTab = () => { native++; };
    try {
      const rebuild = vi.spyOn(GhostlineSettingTab.prototype as unknown as { renderImperative(): void }, "renderImperative").mockImplementation(() => {});
      const plugin = { manifest: { id: "ghostline" }, settings: { ...DEFAULT_SETTINGS }, saveSettings: async () => {} } as unknown as GhostlinePlugin;
      const tab = new GhostlineSettingTab({} as App, plugin, { renderSettings: () => {}, hideSettings: () => {} } as unknown as LlmConnection) as unknown as { renderTab(): void; hide(): void; display(): void };
      tab.renderTab();
      expect(rebuild).toHaveBeenCalledTimes(1);
      tab.hide();
      tab.renderTab(); // zweites Öffnen
      expect(rebuild).toHaveBeenCalledTimes(2);
      tab.display(); // Neuinstallation ist idempotent: ein renderTab zeichnet genau einmal neu
      tab.renderTab();
      expect(rebuild).toHaveBeenCalledTimes(4);
      expect(native).toBe(0);
      rebuild.mockRestore();
    } finally {
      delete proto.renderTab;
    }
  });
});

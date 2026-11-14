import { setIcon } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { createStatusBarItem, type StatusBarHost, type StatusBarItemHandle } from "../vendor/kit-obsidian/status-bar-item";

export type StatusKind = "ok" | "checking" | "error" | "warning";
export interface StatusState { enabled: boolean; kind: StatusKind; reason?: string; lastFirstWordMs?: number;
  /** Der Klick tut etwas anderes als Umschalten (z. B. Einstellungen öffnen); `reason` nennt die Aktion bereits. */
  ownAction?: boolean }

const ICON: Record<StatusKind, string> = { ok: "circle-check", checking: "loader", error: "circle-x", warning: "alert-triangle" };
const ALL_CLS = ["is-ok", "is-checking", "is-error", "is-warning", "is-off"] as const;

/** Zustands-Knopf (§8: Ist-Zustand im Label, zweites Glyph, aria-pressed) und im Zustand „an“
 *  Status-Indikator (§8: feste Icon- und Klassen-Vokabel). */
export function statusView(s: StatusState): { icon: string; cls: (typeof ALL_CLS)[number]; label: string; pressed: boolean; isToggle: boolean } {
  if (!s.enabled) return { icon: "eye-off", cls: "is-off", label: `${t("status.off")} — ${t("status.toggleHintOff")}`, pressed: false, isToggle: true };
  const parts = [t("status.on")];
  if (s.kind === "ok") parts.push(t("status.ready"));
  if (s.kind === "checking") parts.push(t("status.checking"));
  if (s.reason) parts.push(s.reason);
  if (s.lastFirstWordMs !== undefined) parts.push(t("status.lastMs", String(Math.round(s.lastFirstWordMs))));
  if (!s.ownAction) parts.push(t("status.toggleHint"));
  return { icon: ICON[s.kind], cls: `is-${s.kind}` as const, label: parts.join(" — "), pressed: !s.ownAction, isToggle: !s.ownAction };
}

export interface StatusItemOptions {
  plugin: StatusBarHost;
  /** Zustand des Schalters „Statusleiste“ beim Start. */
  visible: boolean;
  onToggle: () => void;
}

/** Der Eintrag läuft über den Kit-Baustein `status-bar-item` (Schalter `showStatusBar`, Standard an). Klick, Taste und Aufbau stehen in `onCreate`, weil ein
 *  abgehängtes Element seine Zuhörer mitnimmt; `render` zeichnet den gemerkten Zustand nach jedem Wiederanlegen. */
export class StatusItem {
  private state: StatusState = { enabled: true, kind: "ok" };
  private iconEl: HTMLElement | null = null;
  private readonly handle: StatusBarItemHandle;
  constructor(opts: StatusItemOptions) {
    const { onToggle } = opts;
    this.handle = createStatusBarItem({
      plugin: opts.plugin,
      visible: opts.visible,
      cls: "ghostline-status",
      onCreate: (el) => {
        el.setAttr("role", "button");
        el.setAttr("tabindex", "0");
        el.setAttr("data-tooltip-position", "top");
        this.iconEl = el.createSpan({ cls: "ghostline-status-icon" });
        el.addEventListener("click", onToggle);
        el.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } });
      },
      render: (el) => { this.paint(el); },
    });
  }
  render(s: StatusState): void {
    this.state = s;
    this.handle.refresh();
  }
  setVisible(on: boolean): void { this.handle.setVisible(on); }
  destroy(): void { this.handle.destroy(); }
  private paint(el: HTMLElement): void {
    const v = statusView(this.state);
    el.removeClass(...ALL_CLS);
    el.addClass(v.cls);
    if (this.iconEl) setIcon(this.iconEl, v.icon);
    el.setAttr("aria-label", v.label);
    if (v.isToggle) el.setAttr("aria-pressed", String(v.pressed));
    else el.removeAttribute("aria-pressed");
  }
}

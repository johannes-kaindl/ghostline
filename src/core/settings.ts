import type { EndpointChoice } from "../vendor/kit/endpoint-source";
import { sanitizeRequestSettings, type RequestSettings } from "../vendor/kit/sampling-profiles";

export type TabAction = "accept-all" | "accept-word" | "none";
export type RequestPathSetting = "auto" | "chat" | "fim";

export interface GhostlineSettings {
  enabled: boolean;
  tabAction: TabAction;
  requestPath: RequestPathSetting;
  delayMs: number;
  contextChars: number;
  excludePatterns: string;
  choice: EndpointChoice;
  request: RequestSettings;
}

export const DELAY_MIN = 150, DELAY_MAX = 1000, CONTEXT_MIN = 300, CONTEXT_MAX = 4000;
export const AFTER_CHARS = 200, MAX_TOKENS = 40, ERROR_PAUSE_MS = 10_000, EMPTY_WARN_AFTER = 3;
/** Gesamtfrist je Anfrage. Der FIM-Client kennt weder Leerlauf- noch Erstes-Chunk-Frist; ein
 *  stummer Server würde die Session sonst ewig im Zustand „requesting“ halten. */
export const REQUEST_DEADLINE_MS = 20_000;

export const DEFAULT_SETTINGS: GhostlineSettings = {
  enabled: true,
  tabAction: "accept-all",
  requestPath: "auto",
  delayMs: 300,
  contextChars: 1500,
  excludePatterns: "",
  choice: {},
  request: { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (v: unknown, min: number, max: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;

/** Einzige Stelle, an der gespeicherte Daten zu Settings werden: unbekannte Felder fallen weg
 *  (so kommt nie eine URL oder ein Schlüssel zurück in `data.json`), Zahlen werden geklemmt. */
export function normalizeSettings(raw: unknown): GhostlineSettings {
  const r = isObj(raw) ? raw : {};
  const choiceRaw = isObj(r.choice) ? r.choice : {};
  const choice: EndpointChoice = {};
  if (typeof choiceRaw.endpointId === "string" && choiceRaw.endpointId) choice.endpointId = choiceRaw.endpointId;
  if (typeof choiceRaw.model === "string" && choiceRaw.model) choice.model = choiceRaw.model;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_SETTINGS.enabled,
    tabAction: oneOf(r.tabAction, ["accept-all", "accept-word", "none"] as const, "accept-all"),
    requestPath: oneOf(r.requestPath, ["auto", "chat", "fim"] as const, "auto"),
    delayMs: clamp(r.delayMs, DELAY_MIN, DELAY_MAX, DEFAULT_SETTINGS.delayMs),
    contextChars: clamp(r.contextChars, CONTEXT_MIN, CONTEXT_MAX, DEFAULT_SETTINGS.contextChars),
    excludePatterns: typeof r.excludePatterns === "string" ? r.excludePatterns : "",
    choice,
    request: sanitizeRequestSettings(r.request).settings,
  };
}

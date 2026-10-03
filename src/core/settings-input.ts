import { t } from "../vendor/kit/i18n";
import { parsePatterns } from "../vendor/kit/ignore";
import type { ClockPort } from "../vendor/kit-obsidian/clock";

/** Zahl aus einem Eingabefeld: geklemmt wird erst beim Übernehmen, nie beim Tippen.
 *  Unbrauchbares (leer, Text) ergibt null — dann bleibt der alte Wert. */
export function parseBounded(raw: string, min: number, max: number): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

/** Entprellt eine Speicheraktion über den injizierten Clock-Port. `flush` führt eine
 *  ausstehende Aktion sofort aus (Fokusverlust, Tab schließen), `cancel` verwirft sie. */
export function createDebouncer(clock: ClockPort, ms: number, fn: () => void) {
  let id: number | null = null;
  const clear = (): boolean => { if (id === null) return false; clock.clearTimeout(id); id = null; return true; };
  return {
    schedule(): void { clear(); id = clock.setTimeout(() => { id = null; fn(); }, ms); },
    flush(): void { if (clear()) fn(); },
    cancel(): void { clear(); },
  };
}

/** Beschreibung der Ausschlussliste; nennt die Zeilen, die als Muster ungültig sind. */
export function excludeDescription(patterns: string): string {
  const invalid = parsePatterns(patterns).invalid;
  return invalid.length > 0 ? `${t("set.excludeDesc")} ${t("set.excludeInvalid", invalid.join(", "))}` : t("set.excludeDesc");
}

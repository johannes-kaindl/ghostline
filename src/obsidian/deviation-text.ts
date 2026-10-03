import { t } from "../vendor/kit/i18n";
import type { Deviation, DeviationKind } from "../vendor/kit/sampling-profiles";

/** Textbausteine für Abweichungen: eine Zuordnung für die Statusmeldung und den Abschnitt
 *  „Anfrage“. `detail` kann Modellausgabe oder Serverfehler enthalten und wird nur angezeigt. */
const KEY: Record<DeviationKind, string> = {
  "thinking-despite-off": "request.dev.thinkingDespiteOff",
  "empty-by-budget": "request.dev.emptyByBudget",
  "family-mismatch": "request.dev.familyMismatch",
  "family-detected": "request.dev.familyDetected",
  "rejected": "request.dev.rejected",
};

export function deviationDetail(kind: DeviationKind, detail?: string): string {
  return detail !== undefined ? t(KEY[kind], detail) : t(KEY[kind]);
}

export function deviationNotice(d: Deviation): string {
  return `${deviationDetail(d.kind, d.detail)} ${t("request.dev.seeSettings")}`;
}

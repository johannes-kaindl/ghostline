import { t } from "../vendor/kit/i18n";
import type { StatusState } from "./status-item";

/** Wendet einen Statuswechsel an. `enabled` kommt immer aus den Settings; `reason: undefined`
 *  entfernt den Grund; `ownAction` gilt nur für den Zustand, der es setzt, und fällt beim
 *  nächsten Wechsel von selbst weg. */
export const REASON_MAX = 200;

/** Server- und Proxy-Fehler können den Prompt zurückspiegeln: Gründe werden gekappt (Final-Review M4). */
export function capReason(reason: string): string {
  return reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX - 1)}…` : reason;
}

export function applyStatus(prev: StatusState, patch: Partial<StatusState>, enabled: boolean): StatusState {
  const next: StatusState = { ...prev, ...patch, enabled };
  if (next.reason !== undefined) next.reason = capReason(next.reason);
  if (patch.ownAction === undefined) delete next.ownAction;
  if (next.reason === undefined) delete next.reason;
  return next;
}

/** „Kein Endpunkt“: der Grund ist schon übersetzt, der Klick öffnet die Einstellungen. */
export function noEndpointPatch(): Partial<StatusState> {
  return { kind: "warning", reason: t("status.noEndpoint"), ownAction: true };
}

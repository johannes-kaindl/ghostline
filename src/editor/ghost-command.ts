import type { Ghost } from "./ghost-field";

/** Verfügbarkeit der Editor-Befehle: Annehmen und Verwerfen nur bei sichtbarem Vorschlag,
 *  damit ein Nutzer-Hotkey ohne Vorschlag nicht verschluckt wird. */
export function ghostCommandAvailable(id: string, ghost: Ghost | null): boolean {
  return id === "request-now" || ghost !== null;
}

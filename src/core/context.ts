import { frontmatterEnd } from "./frontmatter";
import { EMAIL_REDACT_RULE, SECRET_REDACT_RULES, redactText } from "../vendor/kit/redact";

export interface CompletionContext { title: string; extra: string; before: string; after: string }
export interface ContextInput { title: string; docText: string; cursor: number; maxBefore: number; maxAfter: number; extra?: string }

const QUERY_BLOCK = /```(?:dataview|dataviewjs|base)[^\n]*\n[\s\S]*?```/g;
const MAIL_AND_SECRETS = [...SECRET_REDACT_RULES, EMAIL_REDACT_RULE];

export function removeQueryBlocks(text: string): string { return text.replace(QUERY_BLOCK, ""); }
/** Schwärzt Geheimnisse und E-Mail-Adressen (Kit-Regeln, dazu die Kit-Regel für verwaiste PEM-Hälften an Ausschnittsrändern). */
export function redact(text: string): string {
  return redactText(text, MAIL_AND_SECRETS).text;
}

/** Anfang des Fensters über `text`: die früheste Absatzgrenze, ab der höchstens `max` Zeichen
 *  bleiben. Springt dadurch absatzweise — der Prompt-Anfang bleibt zwischen zwei Anfragen
 *  gleich und LM Studio kann ihn zwischenspeichern (Spec § 7.1). */
export function windowStart(text: string, max: number): number {
  if (text.length <= max) return 0;
  const minStart = text.length - max;
  for (const m of text.matchAll(/\n\s*\n/g)) {
    const b = (m.index ?? 0) + m[0].length;
    if (b >= minStart) return b;
  }
  for (const m of text.matchAll(/[.!?…]\s+/g)) {
    const s = (m.index ?? 0) + m[0].length;
    if (s >= minStart) return s;
  }
  return minStart;
}

const MARGIN = 512;

/** Schwärzen VOR dem Fensterschnitt, damit der Schnitt kein Geheimnis-Fragment freilegt.
 *  Die Arbeit ist begrenzt (Vorlauf max(maxBefore*3, 16384) + Rand, Nachlauf maxAfter + Rand); Trade-off:
 *  ein Schlüsselblock, dessen BEGIN-Zeile vor dem Vorlauf liegt, ist nicht erkennbar. */
export function buildContext(i: ContextInput): CompletionContext {
  const fm = frontmatterEnd(i.docText);
  const from = Math.max(Math.min(fm, i.cursor), i.cursor - (Math.max(i.maxBefore * 3, 16384) + MARGIN));
  const rawBefore = redact(removeQueryBlocks(i.docText.slice(from, i.cursor)));
  const before = rawBefore.slice(windowStart(rawBefore, i.maxBefore));
  const after = redact(removeQueryBlocks(i.docText.slice(i.cursor, i.cursor + i.maxAfter + MARGIN))).slice(0, i.maxAfter);
  return { title: redact(i.title), extra: i.extra ?? "", before, after };
}

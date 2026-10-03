export interface FimTemplate { family: string; match: RegExp; prefix: string; suffix: string; middle: string; stop: string[] }

/** FIM-Schreibweise je Modellfamilie. Nur gemessene Einträge (Spec § 7.2); Kandidat für die
 *  Familien-Beschreibung im Kit, Entscheidung Master. Quelle: Qwen2.5-Coder Model Card. */
export const FIM_TEMPLATES: readonly FimTemplate[] = [
  { family: "qwen2.5-coder", match: /qwen2\.5-coder/i, prefix: "<|fim_prefix|>", suffix: "<|fim_suffix|>", middle: "<|fim_middle|>", stop: ["<|endoftext|>", "<|fim_pad|>", "<|file_sep|>"] },
];

export function fimTemplateFor(model: string): FimTemplate | null {
  return FIM_TEMPLATES.find((t) => t.match.test(model)) ?? null;
}

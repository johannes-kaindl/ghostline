import type { CompletionContext } from "./context";
import type { FimTemplate } from "./fim-templates";

export const CURSOR_MARK = "<cursor/>";
export const SYSTEM_PROMPT =
  "Continue the text at the <cursor/> marker. Output only the continuation, at most to the end of the current line, in the same language and tone. No quotes, no explanation, do not repeat text that is already there.";

export function buildChatMessages(c: CompletionContext): { role: "system" | "user"; content: string }[] {
  const extra = c.extra ? `Related notes:\n${c.extra}\n` : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Note: ${c.title}\n${extra}---\n${c.before}${CURSOR_MARK}${c.after}` },
  ];
}

export function buildFimPrompt(c: CompletionContext, t: FimTemplate): string {
  const extra = c.extra ? `${c.extra}\n\n` : "";
  return `${t.prefix}${c.title}\n\n${extra}${c.before}${t.suffix}${c.after}${t.middle}`;
}

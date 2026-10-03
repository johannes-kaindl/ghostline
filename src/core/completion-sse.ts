/** Kit-Kandidat: text-Variante von parseSSE.
 *  SSE-Zeilen von `/v1/completions`: der Text steht in `choices[0].text`. Gegenstück zu
 *  `parseSSE` (code-kit), das nur `delta.content` liest. Rein, ohne Zustand. */
export function parseCompletionSSE(buffer: string): { text: string[]; finishReason?: string; rest: string; done: boolean } {
  const text: string[] = [];
  let finishReason: string | undefined;
  let done = false;
  const lines = buffer.split(/\r\n|\n|\r/);
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") { done = true; continue; }
    try {
      const j = JSON.parse(data) as { choices?: { text?: unknown; finish_reason?: unknown }[] };
      const c0 = j.choices?.[0];
      if (typeof c0?.text === "string") text.push(c0.text);
      if (finishReason === undefined && typeof c0?.finish_reason === "string" && c0.finish_reason) finishReason = c0.finish_reason;
    } catch { /* unvollständige Zeile — bei kompletten Zeilen nicht erwartet */ }
  }
  return { text, finishReason, rest, done };
}

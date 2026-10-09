import type { LlmConnection } from "../vendor/kit-obsidian/llm-connection";
import { buildChatMessages } from "../core/prompt";
import { STOP, type CompletionPath, type PathResult } from "./paths";

/** Chat-Pfad über die Verbindung: Auflösung, Parameter (Modus `complete`, Budget `MAX_TOKENS`), Client und Prüfung der
 *  Antwort liegen dort. `r.endpoint`, `r.model` und `r.params` gehören dem FIM-Pfad; hier gilt, was die Verbindung auflöst. */
export function createChatPath(llm: Pick<LlmConnection, "complete">): CompletionPath {
  return {
    kind: "chat",
    async request(r): Promise<PathResult> {
      let acc = "";
      const res = await llm.complete({ messages: buildChatMessages(r.ctx) }, {
        signal: r.signal,
        overrides: { stop: STOP },
        onToken: (t) => { acc += t; r.onText(acc); },
      });
      if (res.ok) {
        return { ok: true, raw: res.content, timing: res.timing, facts: res.facts ?? { status: 200, content: res.content, reasoning: res.reasoning, finishReason: res.finishReason ?? null } };
      }
      return { ok: false, kind: res.kind === "no-endpoint" ? "other" : res.kind, detail: res.detail, timing: res.timing };
    },
  };
}

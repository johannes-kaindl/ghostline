import type { ChatClient } from "../vendor/kit-obsidian/chat-client";
import { buildChatMessages } from "../core/prompt";
import { STOP, type CompletionPath } from "./paths";

export function createChatPath(chat: ChatClient): CompletionPath {
  return {
    kind: "chat",
    async request(r) {
      let acc = "";
      const res = await chat.complete({
        endpoint: r.endpoint, model: r.model, messages: buildChatMessages(r.ctx),
        params: { ...r.params, stop: STOP }, signal: r.signal,
        onToken: (t) => { acc += t; r.onText(acc); },
      });
      if (res.ok) return { ok: true, raw: res.content, timing: res.timing, facts: { status: 200, content: res.content, reasoning: res.reasoning, finishReason: res.finishReason ?? null, ...(res.model ? { responseModel: res.model } : {}) } };
      const kind = res.kind === "aborted" || res.kind === "network" || res.kind === "timeout" || res.kind === "http" ? res.kind : "other";
      return { ok: false, kind, detail: res.detail, timing: res.timing };
    },
  };
}

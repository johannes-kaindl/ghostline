import type { RequestPathSetting } from "./settings";
import { fimTemplateFor, type FimTemplate } from "./fim-templates";

export function choosePath(setting: RequestPathSetting, model: string): { kind: "chat" | "fim"; template: FimTemplate | null; warning?: "fim-unsupported" } {
  if (setting === "chat") return { kind: "chat", template: null };
  const template = fimTemplateFor(model);
  if (template) return { kind: "fim", template };
  return setting === "fim" ? { kind: "chat", template: null, warning: "fim-unsupported" } : { kind: "chat", template: null };
}

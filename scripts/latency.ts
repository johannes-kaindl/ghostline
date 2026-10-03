/**
 * Latenzmessung (Spec § 9.5) — Zeit bis zum ersten Wort und bis zum Ende, je Modell und Weg.
 *
 * Läuft nur nach Absprache mit dem Master über die Modellbelegung in LM Studio — JIT lädt Modelle und verdrängt die anderer Sessions (Spec § 9.5).
 * Läuft nicht im Gate. Aufruf: npm run latency -- --endpoint http://127.0.0.1:1234 --models a,b,c --runs 5
 *
 * Gemessen wird der echte Prompt: Kontext über `buildContext`, Nachrichten über `buildChatMessages`, FIM-Prompt über
 * `buildFimPrompt` (nur wenn `fimTemplateFor(model)` trifft).
 *
 * Sampling: NICHT die festen Werte aus dem Plan (temperature 0.2). Das Plugin schreibt keine feste Temperatur; die Werte
 * kommen aus der Kit-Tabelle, Modus `complete` (`completeParams` in src/llm/paths.ts, Backend `lmstudio`, Familie aus
 * dem Modellnamen). Das Skript baut die Parameter genauso, damit es die Anfrage misst, die das Plugin sendet
 * (max_tokens 40 und reasoning_effort aus der Familie stecken darin; stop `["\n"]` wie im Plugin).
 * Abbruchprobe: max_tokens 400, nach dem ersten Stück abbrechen, sofort eine zweite Anfrage.
 */
import { buildContext } from "../src/core/context";
import { fimTemplateFor } from "../src/core/fim-templates";
import { buildChatMessages, buildFimPrompt } from "../src/core/prompt";
import { completeParams, STOP } from "../src/llm/paths";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { familyFromName } from "../src/vendor/kit/sampling-profiles";
import { abortVerdict, fmtMs, formatTable, median, parseArgs, parseSseText, percentile, type Row } from "./latency-lib";

const TITLE = "Wochenplanung";
const DOC = "Am Montag besprechen wir im Team die Planung für die kommende Woche. Es geht vor allem darum, wer welche Aufgaben übernimmt und wo es noch Abhängigkeiten gibt.\n\nAm Dienstag fahren wir gemeinsam zum Kunden, um die neue Version vorzustellen. Danach wollen wir ";
const WORDS = ["noch", "kurz", "gemeinsam", "in", "Ruhe", "zusammen", "mit", "dem", "Team", "etwas"];

interface Timed { firstMs: number | null; totalMs: number; text: string; error?: string }

async function request(url: string, body: Record<string, unknown>, kind: "chat" | "fim", abortAfterFirst = false): Promise<Timed> {
  const ac = new AbortController();
  const t0 = performance.now();
  let first: number | null = null;
  let text = "";
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
    if (!res.ok || !res.body) return { firstMs: null, totalMs: performance.now() - t0, text: "", error: `HTTP ${res.status}` };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const p = parseSseText(buf + dec.decode(value, { stream: true }), kind);
      buf = p.rest;
      if (p.texts.length > 0) {
        if (first === null) first = performance.now() - t0;
        text += p.texts.join("");
        if (abortAfterFirst) { ac.abort(); break; }
      }
    }
  } catch (e) {
    if (!(e instanceof Error && e.name === "AbortError")) return { firstMs: first, totalMs: performance.now() - t0, text, error: e instanceof Error ? e.message : String(e) };
  }
  return { firstMs: first, totalMs: performance.now() - t0, text };
}

function bodyFor(model: string, kind: "chat" | "fim", extraWord: string, overrideMax?: number): { url: string; body: Record<string, unknown> } {
  const family = familyFromName(model);
  const { params } = completeParams({ family, backend: "lmstudio", request: DEFAULT_SETTINGS.request });
  const docText = DOC + extraWord;
  const ctx = buildContext({ title: TITLE, docText, cursor: docText.length, maxBefore: DEFAULT_SETTINGS.contextChars, maxAfter: 0 });
  const p = { ...params, ...(overrideMax !== undefined ? { max_tokens: overrideMax } : {}) };
  if (kind === "chat") return { url: "/v1/chat/completions", body: { model, messages: buildChatMessages(ctx), stream: true, ...p, stop: STOP } };
  const tpl = fimTemplateFor(model);
  if (!tpl) throw new Error("kein FIM-Template");
  return { url: "/v1/completions", body: { model, prompt: buildFimPrompt(ctx, tpl), stream: true, ...p, stop: [...STOP, ...tpl.stop] } };
}

async function measure(base: string, model: string, kind: "chat" | "fim", runs: number): Promise<Row> {
  const path = kind === "chat" ? "Chat" : "FIM";
  const go = async (word: string, max?: number, abort = false): Promise<Timed> => {
    const { url, body } = bodyFor(model, kind, word, max);
    return request(base + url, body, kind, abort);
  };
  const cold = await go("");
  const warm: number[] = [];
  let sample = cold.text;
  for (let i = 0; i < runs; i++) {
    const r = await go(WORDS[i % WORDS.length] ?? "");
    if (r.firstMs !== null) warm.push(r.firstMs);
    if (r.text) sample = r.text;
  }
  await go("Hallo", 400, true);
  const after = await go("Hallo2");
  const med = median(warm);
  return {
    model, path, cold: cold.error ? `Fehler ${cold.error}` : fmtMs(cold.firstMs),
    warmMedian: fmtMs(med), warmP90: fmtMs(percentile(warm, 90)),
    abort: after.error ? `Fehler ${after.error}` : abortVerdict(after.firstMs, med), sample: sample.slice(0, 60),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) { console.error(args.error); process.exit(2); }
  console.log(`# Ghostline Latenz — ${new Date().toISOString().slice(0, 10)}\n`);
  try {
    const m = await fetch(`${args.endpoint}/v1/models`);
    const j = (await m.json()) as { data?: { id?: string }[] };
    console.log(`GET /v1/models: ${(j.data ?? []).map((d) => d.id ?? "?").join(", ")}\n`);
  } catch (e) { console.log(`GET /v1/models fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}\n`); }
  const rows: Row[] = [];
  for (const model of args.models) {
    rows.push(await measure(args.endpoint, model, "chat", args.runs));
    if (fimTemplateFor(model)) rows.push(await measure(args.endpoint, model, "fim", args.runs));
  }
  console.log(formatTable(rows));
}

void main();

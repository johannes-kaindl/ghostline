/**
 * GUI-Smoke — faehrt die Pruefpunkte G1-G15 aus docs/internal/SMOKE.md gegen ein LAUFENDES Obsidian
 * (CORE-TEST-02 b). Ein Fake-LLM-Server und ein Fake-Manager (llm-endpoint-manager, Plugin-API v1)
 * leben im Treiber: kein echtes Modell, keine echte URL, kein Schluessel.
 *
 * ## Zweitinstanz (der richtige Ort fuer diesen Lauf — eigenes Profil, eigener Port)
 *
 * Reihenfolge laut obsidian-plugins/AGENTS.md § Staging-Vaults (a)-(c):
 *
 *   echo "$STAGING_VAULTS_DIR"                                          # muss gesetzt sein (~/.zshenv)
 *   UD=/tmp/obs-test-ghostline; mkdir -p "$UD"
 *   lsof -nP -iTCP:9363 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
 *   pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w13 nehmen"
 *   npm run build && npm run smoke:gui -- --setup                       # Vault aus fixtures/vault/
 *   # (a) aktuelle Version statt gebuendelter (nachsehen: ls ~/Library/Application\ Support/obsidian/*.asar)
 *   cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 *   # Vault registrieren (Obsidian liest obsidian.json nur beim Start):
 *   node -e 'const p=process.env.STAGING_VAULTS_DIR+"/ghostline";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{ghostline:{path:p,ts:Date.now(),open:true}}}))' "$UD"
 *   /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9363 &
 *   # Prozess-PID merken: beendet wird NUR sie, nie pkill/killall. Je Messlauf frischer Prozess.
 *   python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label ghostline --intent "GUI-Smoke Zweitinstanz :9363" --exclusive focus --port 9363 --ttl 300
 *   npm run smoke:gui -- --port 9363     # (b) Restricted Mode: setEnable(true), (c) Vertrauensdialog: macht der Treiber
 *   python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 *
 * Der erste Lauf nach dem Anlegen eines Profils ist ein Aufwaermlauf und zaehlt nicht.
 * Ein Treiber setzt jeden Zustand, den er anlegt, VOR dem Lauf zurueck (Notizen, Einstellungen,
 * Vim-Modus, Hotkey) und nach dem Lauf noch einmal.
 *
 * Gemessen wird im eigenen Staging-Vault (`stagingVaultDir("ghostline")`), nie im Arbeits-Vault.
 * Hinweis: DOM-Pruefungen sind kein Layout-Beweis — wie die Statusleiste aussieht, zeigt kein Punkt hier.
 *
 * Typen: `tsconfig.scripts.json` (im `gate` ueber `npm run typecheck:scripts`).
 */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { cwd } from "node:process";

import { Cdp, attachTo, clickReal, closeExtraLeaves, notices, pollUntil, requireVisible, setPluginSetting } from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const REPO_NAME = "ghostline";
const PLUGIN_ID = "ghostline";
const MANAGER_ID = "llm-endpoint-manager";
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, "fixtures/vault");
const NOTES_DIR = join(FIXTURE_DIR, "notes");
const NOTES = ["Schreiben.md", "Code.md", "Clippings/Fremd.md", "Aus.md", "Liste.md", "Schluessel.md"] as const;
const CHAT_MODEL = "smoke-chat";
const FIM_MODEL = "qwen2.5-coder-smoke";
const REDACT_MARK = "[redacted-private-key]";

type Zustand = "gruen" | "rot" | "uebersprungen" | "nichts gemessen";
interface Check { name: string; zustand: Zustand; detail: string }
const checks: Check[] = [];
function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, zustand: passed ? "gruen" : "rot", detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name} — ${detail}`);
}
function nichtGemessen(name: string, grund: string): void {
  checks.push({ name, zustand: "nichts gemessen", detail: grund });
  console.log(`  ? ${name} — nichts gemessen: ${grund}`);
}

const q = (s: string): string => JSON.stringify(s);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const original = (rel: string): string => readFileSync(join(NOTES_DIR, rel), "utf8");

// ───────────────────────── Tastendruck und Texteingabe ─────────────────────────

// uebernommen aus json-editor/scripts/gui-smoke.ts, 2026-10-03
// Dort `pressKey(cdp, key, modifiers)` mit fester Tabelle (ArrowDown/ArrowUp); hier um `code` und den
// virtuellen Tastencode als Parameter erweitert (Tab, Pfeil rechts, Escape). n=2 mit json-editor —
// damit ist das Primitiv reif fuer tools/obsidian-cdp/ (Meldung an den Master). Echter Host-Tastendruck
// statt `new KeyboardEvent(...)`: ein synthetisches Event traegt isTrusted:false.
async function pressKey(cdp: Cdp, key: string, code = key, vk = 0, modifiers = 0): Promise<void> {
  const common = { key, code, windowsVirtualKeyCode: vk, modifiers };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...common });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}
/** Ein Zeichen als Tastendruck MIT Text (fuer Vim-Befehle wie `A`). */
async function pressChar(cdp: Cdp, ch: string): Promise<void> {
  const common = { key: ch, text: ch, unmodifiedText: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 8 : 0 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...common });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}
async function typeText(cdp: Cdp, text: string): Promise<void> { await cdp.send("Input.insertText", { text }); }

const TAB = (cdp: Cdp): Promise<void> => pressKey(cdp, "Tab", "Tab", 9);
const ARROW_RIGHT = (cdp: Cdp): Promise<void> => pressKey(cdp, "ArrowRight", "ArrowRight", 39);
const ESCAPE = (cdp: Cdp): Promise<void> => pressKey(cdp, "Escape", "Escape", 27);

async function ghost(cdp: Cdp): Promise<string | null> {
  return (await cdp.evaluate<{ t: string | null }>(`const g = document.querySelector(".workspace-leaf.mod-active .ghostline-ghost"); return { t: g ? g.textContent : null };`)).t;
}
/** Wartet auf den ersten Ghost. Rueckgabe: Text und Wartezeit, `null` = kam nicht. */
async function warteAufGhost(cdp: Cdp, maxMs: number): Promise<{ t: string; ms: number } | null> {
  const t0 = Date.now();
  const r = await pollUntil<{ t: string }>(cdp, `const g = document.querySelector(".workspace-leaf.mod-active .ghostline-ghost"); return g && g.textContent ? { t: g.textContent } : null;`, maxMs, 40);
  return r ? { t: r.t, ms: Date.now() - t0 } : null;
}
/** Wartet, bis der Fake die Antwort VOLLSTAENDIG gesendet hat (und eine Anfrage nach `n0` kam), und gibt
 *  dann den stabilen Ghost zurueck. Nicht auf die Statusleiste warten: vor dem Timer (delayMs) steht sie
 *  noch auf "bereit" und die Messung liefe vor der Anfrage los. */
async function warteAufAntwort(cdp: Cdp, fake: FakeLlm, f0: number, maxMs: number): Promise<string | null> {
  const t0 = Date.now();
  while (fake.fertig() <= f0 && Date.now() - t0 < maxMs) await sleep(25);
  await sleep(200); // letzter Chunk -> Plugin -> Ghost
  return ghost(cdp);
}
async function statusKlassen(cdp: Cdp): Promise<{ cls: string; pressed: string | null; label: string | null }> {
  return cdp.evaluate(`const s = document.querySelector(".ghostline-status"); return s ? { cls: s.className, pressed: s.getAttribute("aria-pressed"), label: s.getAttribute("aria-label") } : { cls: "", pressed: null, label: null };`);
}
async function zeile(cdp: Cdp, n: number): Promise<string> {
  return (await cdp.evaluate<{ l: string }>(`return { l: app.workspace.activeEditor.editor.getLine(${n}) };`)).l;
}
async function docText(cdp: Cdp): Promise<string> {
  return (await cdp.evaluate<{ d: string }>(`return { d: app.workspace.activeEditor.editor.getValue() };`)).d;
}

// ───────────────────────── Fake-LLM-Server ─────────────────────────

interface Aufzeichnung { path: string; body: string; model: string | null }
interface FakeLlm {
  url: string;
  chat(): number; comp(): number; frueherSchluss(): number; unterwegs(): number; fertig(): number;
  letzte(): Aufzeichnung | null;
  setPause(ms: number): void;
  stoppen(): Promise<void>; starten(): Promise<void>; schliessen(): Promise<void>;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const STUECKE = ["in ", "den ", "Park"];

async function startFakeLlm(): Promise<FakeLlm> {
  let chat = 0, comp = 0, frueh = 0, unterwegs = 0, pause = 0, fertig = 0;
  let letzte: Aufzeichnung | null = null;
  let port = 0;
  let server: Server | null = null;

  const sende = (res: ServerResponse, kind: "chat" | "comp"): void => {
    let i = 0;
    const next = (): void => {
      if (res.destroyed || res.writableEnded) return;
      if (i < STUECKE.length) {
        const text = STUECKE[i++] as string;
        const chunk = kind === "chat" ? { choices: [{ delta: { content: text }, finish_reason: null }] } : { choices: [{ text, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        setTimeout(next, 80);
      } else {
        const end = kind === "chat" ? { choices: [{ delta: {}, finish_reason: "stop" }] } : { choices: [{ text: "", finish_reason: "stop" }] };
        res.write(`data: ${JSON.stringify(end)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    };
    next();
  };

  const bauen = (): Server => createServer((req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method === "GET" && req.url?.includes("/v1/models") === true) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: CHAT_MODEL }, { id: FIM_MODEL }] }));
      return;
    }
    const kind = req.method === "POST" ? (req.url?.includes("/v1/chat/completions") === true ? "chat" : req.url?.includes("/v1/completions") === true ? "comp" : null) : null;
    if (kind === null) { res.writeHead(404); res.end(); return; }
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
    req.on("end", () => {
      if (kind === "chat") chat += 1; else comp += 1;
      let model: string | null = null;
      try { model = ((JSON.parse(body) as { model?: unknown }).model as string | undefined) ?? null; } catch { model = null; }
      letzte = { path: kind === "chat" ? "/v1/chat/completions" : "/v1/completions", body, model };
      unterwegs += 1;
      // `req.on("close")` feuert in neuerem Node nach dem Lesen des Bodys, nicht beim Verbindungsende —
      // der Abbruch durch den Client zeigt sich an der ANTWORT: geschlossen, ohne dass res.end() lief.
      res.on("close", () => { unterwegs -= 1; if (!res.writableEnded) frueh += 1; });
      res.on("finish", () => { fertig += 1; });
      const los = (): void => {
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "text/event-stream", ...CORS });
        sende(res, kind);
      };
      if (pause > 0) setTimeout(los, pause); else los();
    });
  });

  const starten = async (): Promise<void> => {
    if (server) return;
    server = bauen();
    const s = server;
    await new Promise<void>((resolve, reject) => { s.once("error", reject); s.listen(port, "127.0.0.1", resolve); });
    port = (s.address() as AddressInfo).port;
  };
  const stoppen = async (): Promise<void> => {
    const s = server;
    server = null;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => { s.close(() => { resolve(); }); });
  };
  await starten();
  return {
    get url() { return `http://127.0.0.1:${port}`; },
    chat: () => chat, comp: () => comp, frueherSchluss: () => frueh, unterwegs: () => unterwegs, fertig: () => fertig,
    letzte: () => letzte, setPause: (ms) => { pause = ms; },
    starten, stoppen, schliessen: stoppen,
  };
}

/** Fake-Manager nach Plugin-API v1 (Form: lingotuner `installFakeManager`). Haengt ihn ein und
 *  verwirft die gemerkte Aufloesung des Plugins, damit sie neu laeuft. */
async function installFakeManager(cdp: Cdp, url: string): Promise<void> {
  await cdp.evaluate(`
    if (!("__smokeVorherManager" in window)) window.__smokeVorherManager = app.plugins.plugins[${q(MANAGER_ID)}] ?? null;
    const models = [{ id: ${q(CHAT_MODEL)} }, { id: ${q(FIM_MODEL)} }];
    const res = { id: "smoke", label: "Smoke", config: { url: ${q(url)} }, defaultModel: ${q(CHAT_MODEL)}, backend: "lmstudio", models };
    const ep = { id: "smoke", label: "Smoke", url: ${q(url)}, provider: "openai", capabilities: ["chat"], defaultModel: ${q(CHAT_MODEL)}, enabled: true, hasSecret: false, backend: "lmstudio", models };
    const api = {
      version: 1,
      list: () => [ep],
      get: (id) => (id === "smoke" ? ep : null),
      resolve: async () => res,
      materialize: async (id) => (id === "smoke" ? res : { error: "not-found" }),
      models: async (id) => (id === "smoke" ? [${q(CHAT_MODEL)}, ${q(FIM_MODEL)}] : { error: "not-found" }),
      importEndpoints: async (eps) => ({ added: [], merged: [], skipped: eps.map((e) => e.url) }),
      on: () => () => {},
    };
    app.plugins.plugins[${q(MANAGER_ID)}] = { api };
    app.plugins.plugins[${q(PLUGIN_ID)}].targetPromise = null;
    return { ok: true };
  `);
}
async function removeFakeManager(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    if ("__smokeVorherManager" in window) {
      const v = window.__smokeVorherManager;
      if (v === null) delete app.plugins.plugins[${q(MANAGER_ID)}]; else app.plugins.plugins[${q(MANAGER_ID)}] = v;
      delete window.__smokeVorherManager;
    }
    const p = app.plugins.plugins[${q(PLUGIN_ID)}];
    if (p) p.targetPromise = null;
    return { ok: true };
  `);
}
async function waehleModell(cdp: Cdp, model: string): Promise<void> {
  await setPluginSetting(cdp, PLUGIN_ID, "choice", { endpointId: "smoke", model });
  await cdp.evaluate(`app.plugins.plugins[${q(PLUGIN_ID)}].targetPromise = null; return { ok: true };`);
}

// ───────────────────────── Zustand herstellen ─────────────────────────

/** Die Fixture-Einstellungen, die der Treiber veraendert — Quelle ist plugin-data.json, nicht das Gedaechtnis. */
function fixtureEinstellungen(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "plugin-data.json"), "utf8")) as Record<string, unknown>;
}
async function setzeEinstellungenZurueck(cdp: Cdp): Promise<void> {
  const f = fixtureEinstellungen();
  await cdp.evaluate(`
    const p = app.plugins.plugins[${q(PLUGIN_ID)}];
    Object.assign(p.settings, ${JSON.stringify(f)});
    await p.saveSettings();
    p.targetPromise = null;
    return { ok: true };
  `);
}
/** Notizen auf den Fixture-Text, Layout leer. Eine offene Notiz wuerde die Aenderung sonst zurueckschreiben. */
async function setzeNotizenZurueck(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    app.workspace.detachLeavesOfType("markdown");
    await new Promise((r) => setTimeout(r, 300));
    const texte = ${JSON.stringify(Object.fromEntries(NOTES.map((n) => [n, original(n)])))};
    for (const [pfad, text] of Object.entries(texte)) {
      const f = app.vault.getAbstractFileByPath(pfad);
      if (f) await app.vault.modify(f, text);
      else await app.vault.create(pfad, text);
    }
    return { ok: true };
  `);
}
async function entferneHotkey(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const hm = app.hotkeyManager;
    const id = ${q(`${PLUGIN_ID}:accept`)};
    if (hm) {
      if (typeof hm.removeHotkeys === "function") hm.removeHotkeys(id); else hm.setHotkeys(id, []);
      if (hm.customKeys) delete hm.customKeys[id];
      if (typeof hm.bake === "function") hm.bake();
    }
    return { ok: true };
  `);
}

/** Notiz oeffnen (Fixture-Text frisch auf die Platte), Cursor setzen, Editor fokussieren.
 *  `zeileNr` null = ans Ende der letzten nicht leeren Zeile.
 *
 *  ⚠️ Der Schreibweg ist entkoppelt von der Messung: ein `vault.modify` kurz vor `openFile` kollidiert mit dem
 *  verzoegerten Speichern der vorigen Notiz, Obsidian mischt die Aenderung in den offenen Editor, und das Plugin
 *  sieht eine Bearbeitung (gemessen im zweiten Lauf: ein Ghost wie aus dem Nichts, Zeichen aus der Notiz
 *  verschwunden). Deshalb: schliessen, Speichern abwarten, nur bei Abweichung schreiben, nochmal warten, erst dann
 *  oeffnen — und danach pruefen, dass der Editor den Fixture-Text traegt. */
async function oeffne(cdp: Cdp, pfad: (typeof NOTES)[number], zeileNr: number | null = null): Promise<void> {
  await cdp.evaluate(`app.workspace.detachLeavesOfType("markdown"); return { ok: true };`);
  await sleep(900);
  const text = original(pfad);
  const geschrieben = await cdp.evaluate<{ w: boolean }>(`
    const f = app.vault.getAbstractFileByPath(${q(pfad)});
    const platte = await app.vault.read(f);
    if (platte === ${q(text)}) return { w: false };
    await app.vault.modify(f, ${q(text)});
    return { w: true };
  `);
  if (geschrieben.w) await sleep(900);
  await cdp.evaluate(`
    const f = app.vault.getAbstractFileByPath(${q(pfad)});
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(f);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    return { ok: true };
  `);
  await pollUntil<{ ok: boolean }>(cdp, `const e = app.workspace.activeEditor; return e && e.editor && e.file && e.file.path === ${q(pfad)} ? { ok: true } : null;`, 5000, 100);
  await sleep(700); // Metadaten (Frontmatter-Ausschluss) und etwaige Nachlaeufer des Ladens setzen sich
  const traegt = await docText(cdp);
  if (traegt !== text) throw new Error(`oeffne(${pfad}): der Editor traegt nicht den Fixture-Text (${traegt.length} statt ${text.length} Zeichen) — Messung waere wertlos.`);
  await cdp.evaluate(`
    const ed = app.workspace.activeEditor.editor;
    let n = ${zeileNr === null ? "-1" : String(zeileNr)};
    if (n < 0) { n = ed.lastLine(); while (n > 0 && ed.getLine(n).length === 0) n -= 1; }
    ed.setCursor({ line: n, ch: ed.getLine(n).length });
    ed.focus();
    return { ok: true };
  `);
  // Eine Cursorbewegung loest im Plugin selbst einen Vorschlag aus (suggestion.ts: `other-change` startet den
  // Timer neu) — das Setzen des Cursors am Zeilenende ist also schon ein Ausloeser. Gemessen im dritten Lauf:
  // jede Schreiben.md-Oeffnung kostete eine Anfrage und liess einen Ghost stehen, den G10 mit der Taste annahm.
  // Der Treiber wartet diese Anfrage ab und verwirft den Ghost mit dem echten Escape; Messungen beginnen ruhig.
  await sleep(1300);
  if ((await ghost(cdp)) !== null) { await ESCAPE(cdp); await sleep(250); }
}

// ───────────────────────── Setup ─────────────────────────

function setupVault(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  console.log(`Staging-Vault gebaut: ${vaultDir}`);
  for (const l of log) console.log(`  · ${l}`);
  // `buildVault` entfernt data.json absichtlich (Auslieferungszustand); der Lauf braucht die Fixture-Fassung.
  const quelle = join(FIXTURE_DIR, "plugin-data.json");
  if (existsSync(quelle)) {
    copyFileSync(quelle, join(vaultDir, ".obsidian", "plugins", PLUGIN_ID, "data.json"));
    console.log("  · Plugin-Einstellungen aus fixtures/vault/plugin-data.json gesetzt");
  }
  console.log("\nDen Vault in der Zweitinstanz registrieren (Rezept im Dateikopf) und dann:");
  console.log("  npm run smoke:gui -- --port 9363");
}

async function grundlage(cdp: Cdp, vaultName: string): Promise<void> {
  console.log("\nGrundlage");
  let geladen = (await cdp.evaluate<{ g: boolean }>(`return { g: Boolean(app.plugins.plugins[${q(PLUGIN_ID)}]) };`)).g;
  if (!geladen) {
    // (c) Vertrauensdialog eines frischen Profils, (b) Restricted Mode — in dieser Reihenfolge.
    const vertraut = await cdp.evaluate<{ s: string }>(`
      const btn = [...document.querySelectorAll(".modal-container button")].find((b) => /trust|vertrau/i.test(b.textContent));
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 1200)); return { s: "Vertrauensdialog bestaetigt" }; }
      return { s: "kein Vertrauensdialog" };
    `);
    const frei = await cdp.evaluate<{ s: string }>(`
      try {
        if (app.plugins.setEnable) await app.plugins.setEnable(true);
        await app.plugins.enablePluginAndSave(${q(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 1500));
        return { s: app.plugins.plugins[${q(PLUGIN_ID)}] ? "freigeschaltet" : "Aufruf ohne Wirkung" };
      } catch (e) { return { s: "Fehler: " + (e && e.message ? e.message : String(e)) }; }
    `);
    geladen = (await cdp.evaluate<{ g: boolean }>(`return { g: Boolean(app.plugins.plugins[${q(PLUGIN_ID)}]) };`)).g;
    console.log(`  Plugin war nicht geladen: ${vertraut.s}, ${frei.s}`);
  }
  if (!geladen) throw new Error(`Plugin ${PLUGIN_ID} laedt nicht (Vault ${vaultName}) — ohne es ist jeder Punkt gegenstandslos.`);
  console.log(`  Plugin geladen, Vault ${vaultName}`);
}

// ───────────────────────── G15: Schwaerzung vor Fensterschnitt ─────────────────────────

/** Bewertet einen aufgezeichneten Anfrage-Body: wie viele Zeilen des Schluesselkoerpers stehen noch drin,
 *  und steht die Schwaerzungsmarke da? Eigene Funktion, damit sie gegen einen undichten Body rot werden kann. */
function pruefeSchluesselBody(body: string, schluesselZeilen: string[]): { durchgelassen: number; marke: boolean } {
  return { durchgelassen: schluesselZeilen.filter((l) => body.includes(l)).length, marke: body.includes(REDACT_MARK) };
}
function schluesselZeilen(): string[] {
  const alle = original("Schluessel.md").split("\n");
  const von = alle.findIndex((l) => l.startsWith("-----BEGIN"));
  const bis = alle.findIndex((l) => l.startsWith("-----END"));
  return alle.slice(von + 1, bis);
}
/** Gegenprobe im Treiber, vor jedem Lauf: ein undichter Body MUSS rot werden, ein dichter gruen. */
function selbsttestG15(): void {
  const zeilen = schluesselZeilen();
  const dicht = pruefeSchluesselBody(`{"messages":[{"content":"${REDACT_MARK}\\nDanach"}]}`, zeilen);
  const undicht = pruefeSchluesselBody(`{"messages":[{"content":"${zeilen.slice(20).join("\\n")}\\nDanach"}]}`, zeilen);
  const ok = dicht.durchgelassen === 0 && dicht.marke && undicht.durchgelassen === zeilen.slice(20).length && !undicht.marke;
  console.log(`Selbsttest G15: dichter Body ${dicht.durchgelassen} Zeilen/Marke ${String(dicht.marke)}, undichter Body ${undicht.durchgelassen} Zeilen/Marke ${String(undicht.marke)} → ${ok ? "Pruefung kann rot werden" : "PRUEFUNG TAUGT NICHT"}`);
  if (!ok) throw new Error("Selbsttest G15 fehlgeschlagen: die Pruefung unterscheidet dichte und undichte Bodies nicht.");
}

// ───────────────────────── Pruefpunkte ─────────────────────────

async function g1bis5(cdp: Cdp, fake: FakeLlm): Promise<void> {
  let f0 = 0;
  console.log("\nG1-G5 · Vorschlag, Tab, Wort, Escape, Durchtippen");
  // G1
  await oeffne(cdp, "Schreiben.md");
  const n0 = fake.chat() + fake.comp();
  await typeText(cdp, " ");
  const g1 = await warteAufGhost(cdp, 2000);
  record("G1 Vorschlag erscheint", g1 !== null, g1 ? `Ghost ${JSON.stringify(g1.t)} nach ${g1.ms} ms, Fake sah ${fake.chat() + fake.comp() - n0} Anfrage(n)` : `kein .ghostline-ghost binnen 2000 ms, Fake sah ${fake.chat() + fake.comp() - n0} Anfrage(n), Status ${JSON.stringify((await statusKlassen(cdp)).cls)}`);
  // G2 — frisch, damit G1 nicht zur Vorbedingung wird
  await oeffne(cdp, "Schreiben.md");
  f0 = fake.fertig();
  await typeText(cdp, " ");
  const vor2 = await warteAufAntwort(cdp, fake, f0, 4000);
  await TAB(cdp);
  await sleep(200);
  const z2 = await zeile(cdp, 2);
  const gh2 = await ghost(cdp);
  record("G2 Tab uebernimmt", vor2 !== null && z2.endsWith("in den Park") && gh2 === null, `Ghost vorher ${JSON.stringify(vor2)}, Zeile ${JSON.stringify(z2)}, Ghost danach ${JSON.stringify(gh2)}`);
  // G3
  await oeffne(cdp, "Schreiben.md");
  f0 = fake.fertig();
  await typeText(cdp, " ");
  const vor3 = await warteAufAntwort(cdp, fake, f0, 4000);
  await ARROW_RIGHT(cdp);
  await sleep(200);
  const z3 = await zeile(cdp, 2);
  const gh3 = await ghost(cdp);
  record("G3 Pfeil rechts nimmt ein Wort", vor3 !== null && z3.endsWith("in") && gh3 === " den Park", `Ghost vorher ${JSON.stringify(vor3)}, Zeile ${JSON.stringify(z3)}, Ghost danach ${JSON.stringify(gh3)}`);
  // G4 — Escape auf dem Rest-Ghost von G3 waere ein Folgefehler; frisch
  await oeffne(cdp, "Schreiben.md");
  f0 = fake.fertig();
  await typeText(cdp, " ");
  const vor4 = await warteAufAntwort(cdp, fake, f0, 4000);
  const z4vor = await zeile(cdp, 2);
  await ESCAPE(cdp);
  await sleep(200);
  const z4 = await zeile(cdp, 2);
  const gh4 = await ghost(cdp);
  record("G4 Escape verwirft", vor4 !== null && gh4 === null && z4 === z4vor, `Ghost vorher ${JSON.stringify(vor4)}, danach ${JSON.stringify(gh4)}, Zeile vorher ${JSON.stringify(z4vor)} / nachher ${JSON.stringify(z4)}`);
  // G5
  await oeffne(cdp, "Schreiben.md");
  f0 = fake.fertig();
  await typeText(cdp, " ");
  const vor5 = await warteAufAntwort(cdp, fake, f0, 4000);
  const zaehler5 = fake.chat() + fake.comp();
  await typeText(cdp, "in");
  await sleep(700); // laenger als delayMs (300): eine zweite Anfrage haette sich gemeldet
  const gh5 = await ghost(cdp);
  const zaehlerNach5 = fake.chat() + fake.comp();
  record("G5 Durchtippen", vor5 === "in den Park" && gh5 === " den Park" && zaehlerNach5 === zaehler5, `Ghost vorher ${JSON.stringify(vor5)}, nach "in" ${JSON.stringify(gh5)}, Fake-Zaehler ${zaehler5} → ${zaehlerNach5}`);
}

async function g6(cdp: Cdp, fake: FakeLlm): Promise<void> {
  console.log("\nG6 · Tippen bricht ab");
  await oeffne(cdp, "Schreiben.md");
  fake.setPause(1500);
  try {
    const frueh0 = fake.frueherSchluss();
    const t0 = Date.now();
    await typeText(cdp, " ");
    // Wartet auf die ANKUNFT der Anfrage statt auf feste 400 ms: Timer (300 ms) und Aufloesung
    // schwanken, und ein "x" vor dem Start der Anfrage bricht nichts ab, sondern verhindert sie.
    const unterwegs = await new Promise<number | null>((resolve) => {
      const iv = setInterval(() => { if (fake.unterwegs() > 0) { clearInterval(iv); resolve(Date.now() - t0); } else if (Date.now() - t0 > 2000) { clearInterval(iv); resolve(null); } }, 20);
    });
    if (unterwegs === null) { record("G6 Tippen bricht ab", false, "die Anfrage kam binnen 2000 ms nie beim Fake an — nichts abzubrechen"); return; }
    await typeText(cdp, "x");
    const t1 = Date.now();
    let zu = false;
    while (Date.now() - t1 < 1000) { if (fake.frueherSchluss() > frueh0) { zu = true; break; } await sleep(20); }
    record("G6 Tippen bricht ab", zu, `Anfrage nach ${unterwegs} ms beim Fake, "x" getippt, ${zu ? `Verbindung nach ${Date.now() - t1} ms vorzeitig geschlossen` : "Verbindung blieb 1000 ms offen"} (frueherSchluss ${frueh0} → ${fake.frueherSchluss()})`);
  } finally { fake.setPause(0); }
}

async function g7(cdp: Cdp, fake: FakeLlm): Promise<void> {
  console.log("\nG7 · Tab rueckt ohne Vorschlag ein");
  await oeffne(cdp, "Liste.md", 1);
  const n0 = fake.chat() + fake.comp();
  await sleep(500);
  const gh = await ghost(cdp);
  await TAB(cdp);
  await sleep(300);
  const z = await zeile(cdp, 1);
  const eingerueckt = /^[\t ]/.test(z);
  record("G7 Tab rueckt ohne Vorschlag ein", eingerueckt && gh === null && fake.chat() + fake.comp() === n0, `Zeile 2 ${JSON.stringify(z)} (${eingerueckt ? "eingerueckt" : "NICHT eingerueckt"}), Ghost ${JSON.stringify(gh)}, Fake-Zaehler ${n0} → ${fake.chat() + fake.comp()}`);
}

async function g8(cdp: Cdp, fake: FakeLlm): Promise<void> {
  console.log("\nG8 · Keine Vorschlaege in Code, Frontmatter, ausgeschlossenem Ordner, ghostline: false");
  const faelle: { name: string; pfad: (typeof NOTES)[number]; zeile: number | null }[] = [
    { name: "Codeblock", pfad: "Code.md", zeile: 4 },
    { name: "Frontmatter", pfad: "Code.md", zeile: 1 },
    { name: "Ordner Clippings/", pfad: "Clippings/Fremd.md", zeile: null },
    { name: "ghostline: false", pfad: "Aus.md", zeile: null },
  ];
  const teile: string[] = [];
  let alle = true;
  for (const f of faelle) {
    await oeffne(cdp, f.pfad, f.zeile);
    const n0 = fake.chat() + fake.comp();
    const len0 = (await docText(cdp)).length;
    await typeText(cdp, " ");
    await sleep(800);
    const getippt = (await docText(cdp)).length - len0; // zweiter Kanal: der Treiber hat wirklich etwas getan
    const gh = await ghost(cdp);
    const n1 = fake.chat() + fake.comp();
    const ok = gh === null && n1 === n0 && getippt === 1;
    alle = alle && ok;
    teile.push(`${f.name}: Ghost ${JSON.stringify(gh)}, Zaehler ${n0}→${n1}, Zeichen getippt ${getippt}`);
  }
  record("G8 Keine Vorschlaege in Code, Frontmatter, Ordner, ghostline: false", alle, teile.join(" | "));
}

async function g9(cdp: Cdp): Promise<void> {
  console.log("\nG9 · Vim");
  const vorher = (await cdp.evaluate<{ v: unknown }>(`return { v: app.vault.getConfig("vimMode") ?? null };`)).v;
  try {
    await cdp.evaluate(`app.vault.setConfig("vimMode", true); app.workspace.trigger("css-change"); await new Promise((r) => setTimeout(r, 400)); return { ok: true };`);
    await oeffne(cdp, "Schreiben.md");
    await sleep(400);
    // Normal-Modus: ein Zeichen per typeText loest nichts aus (Vim frisst es). `A` haengt am Zeilenende an (Insert).
    await pressChar(cdp, "A");
    await sleep(150);
    await typeText(cdp, " ");
    const g = await warteAufGhost(cdp, 3000);
    await Promise.resolve(null);
    await ESCAPE(cdp);
    await sleep(300);
    const gh = await ghost(cdp);
    const fett = await cdp.evaluate<{ n: number }>(`return { n: document.querySelectorAll(".workspace-leaf.mod-active .cm-fat-cursor").length };`);
    record("G9 Vim", g !== null && gh === null && fett.n > 0, `Ghost im Insert-Modus ${JSON.stringify(g?.t ?? null)} (${g?.ms ?? "-"} ms), nach Escape ${JSON.stringify(gh)}, .cm-fat-cursor ${fett.n}x (Normal-Modus), vimMode vorher ${JSON.stringify(vorher)}`);
  } finally {
    await cdp.evaluate(`app.vault.setConfig("vimMode", ${JSON.stringify(vorher === true)}); app.workspace.trigger("css-change"); await new Promise((r) => setTimeout(r, 300)); return { ok: true };`);
  }
}

async function g10(cdp: Cdp, fake: FakeLlm): Promise<void> {
  console.log("\nG10 · Eigenes Hotkey ohne Vorschlag (offener Punkt Spec § 6.5)");
  await oeffne(cdp, "Schreiben.md");
  const zaehler0 = fake.chat() + fake.comp();
  const ghostVor = await ghost(cdp);
  try {
    await cdp.evaluate(`
      const hm = app.hotkeyManager;
      hm.setHotkeys(${q(`${PLUGIN_ID}:accept`)}, [{ modifiers: ["Mod", "Shift"], key: "L" }]);
      if (typeof hm.bake === "function") hm.bake();
      const el = document.querySelector(".workspace-leaf.mod-active .cm-content");
      window.__smokeKeys = [];
      window.__smokeKeyHandler = (e) => { window.__smokeKeys.push(e); };
      el.addEventListener("keydown", window.__smokeKeyHandler);
      return { ok: true };
    `);
    const text0 = await docText(cdp);
    const mac = (await cdp.evaluate<{ m: boolean }>(`return { m: /Mac/i.test(navigator.platform) };`)).m;
    const t0 = await notices(cdp);
    await pressKey(cdp, "L", "KeyL", 76, mac ? 12 : 10); // Mod = Meta (4) auf macOS, sonst Ctrl (2); Shift = 8
    await sleep(400);
    const r = await cdp.evaluate<{ n: number; prevented: boolean | null }>(`
      const k = window.__smokeKeys;
      const out = { n: k.length, prevented: k.length ? k[0].defaultPrevented : null };
      document.querySelector(".workspace-leaf.mod-active .cm-content")?.removeEventListener("keydown", window.__smokeKeyHandler);
      delete window.__smokeKeys; delete window.__smokeKeyHandler;
      return out;
    `);
    const text1 = await docText(cdp);
    const t1 = await notices(cdp);
    const durchgereicht = r.n > 0 && r.prevented === false;
    // Messung, kein Urteil ueber das Plugin: gruen heisst "die Messung wurde erhoben und nichts ist kaputtgegangen".
    record("G10 Eigenes Hotkey ohne Vorschlag", text0 === text1 && t0 === t1, `Taste wurde durchgereicht: ${durchgereicht ? "ja" : "nein"} (Editor sah ${r.n} keydown, defaultPrevented=${String(r.prevented)}), Text unveraendert ${String(text0 === text1)}${text0 === text1 ? "" : ` (${JSON.stringify(text0.slice(-30))} → ${JSON.stringify(text1.slice(-30))})`}, Ghost vor der Taste ${JSON.stringify(ghostVor)}, Fake-Zaehler ${zaehler0} → ${fake.chat() + fake.comp()}, Notices ${JSON.stringify(t1)}`);
  } finally { await entferneHotkey(cdp); }
}

async function g11(cdp: Cdp, fake: FakeLlm): Promise<void> {
  let f0 = 0;
  console.log("\nG11 · Statusleiste");
  await oeffne(cdp, "Schreiben.md");
  f0 = fake.fertig();
  await typeText(cdp, " ");
  await warteAufAntwort(cdp, fake, f0, 4000);
  const an = await statusKlassen(cdp);
  const anOk = an.pressed === "true" && an.cls.split(/\s+/).includes("is-ok");
  await clickReal(cdp, `document.querySelector(".ghostline-status")`);
  await sleep(500);
  const aus = await statusKlassen(cdp);
  const ausOk = aus.pressed === "false" && aus.cls.split(/\s+/).includes("is-off") && /^Ghostline: (off|aus)/.test(aus.label ?? "");
  await clickReal(cdp, `document.querySelector(".ghostline-status")`);
  await sleep(500);
  const wieder = await statusKlassen(cdp);
  const wiederOk = wieder.pressed === "true";
  record("G11 Statusleiste", anOk && ausOk && wiederOk, `nach G1: pressed=${an.pressed}, "${an.cls.split(/\s+/).filter((c) => c.startsWith("is-")).join(" ")}" | Klick: pressed=${aus.pressed}, "${aus.cls.split(/\s+/).filter((c) => c.startsWith("is-")).join(" ")}", Label ${JSON.stringify((aus.label ?? "").slice(0, 40))} | Klick: pressed=${wieder.pressed} (Fake-Zaehler ${fake.chat() + fake.comp()})`);
}

async function g12(cdp: Cdp, fake: FakeLlm): Promise<void> {
  console.log("\nG12 · Nicht erreichbar");
  await oeffne(cdp, "Schreiben.md");
  const vorher = await statusKlassen(cdp);
  if (!vorher.cls.split(/\s+/).includes("is-ok")) throw new Error(`G12: Ausgangszustand ist nicht is-ok (${vorher.cls}) — ein vorhandener Fehler wuerde den Punkt gruen faerben.`);
  await fake.stoppen();
  try {
    const t0 = Date.now();
    await typeText(cdp, " ");
    const vorStatus = (await statusKlassen(cdp)).cls;
    const fehler = await pollUntil<{ ok: boolean }>(cdp, `return document.querySelector(".ghostline-status.is-error") ? { ok: true } : null;`, 3000, 50);
    const msFehler = Date.now() - t0;
    const label = (await statusKlassen(cdp)).label;
    await fake.starten();
    const t1 = Date.now();
    await cdp.evaluate(`const ed = app.workspace.activeEditor.editor; const n = ed.lastLine(); ed.setCursor({ line: n, ch: ed.getLine(n).length }); ed.focus(); app.commands.executeCommandById(${q(`${PLUGIN_ID}:request-now`)}); return { ok: true };`);
    const ok = await pollUntil<{ ok: boolean }>(cdp, `return document.querySelector(".ghostline-status.is-ok") && document.querySelector(".workspace-leaf.mod-active .ghostline-ghost") ? { ok: true } : null;`, 2000, 50);
    record("G12 Nicht erreichbar", fehler !== null && ok !== null, `Status vorher ${JSON.stringify(vorStatus.split(/\s+/).filter((c) => c.startsWith("is-")).join(" "))}; is-error ${fehler ? `nach ${msFehler} ms` : "NICHT binnen 3000 ms"} (Label ${JSON.stringify((label ?? "").slice(0, 60))}); nach Neustart des Fake und "Vorschlag jetzt holen": ${ok ? `is-ok und Ghost nach ${Date.now() - t1} ms` : "kein is-ok/Ghost binnen 2000 ms"}`);
  } finally {
    await fake.starten(); // idempotent: laeuft er schon, passiert nichts
  }
  // Die Fehler-Pause (10 s, ERROR_PAUSE_MS) haelt automatische Ausloeser zurueck; manuell ist sie egal.
  // Abwarten, damit G13-G15 nicht an der Pause des Vorgaengers scheitern.
  await sleep(10_500);
}

async function g13und14(cdp: Cdp, fake: FakeLlm): Promise<void> {
  let f0 = 0;
  console.log("\nG13/G14 · Anfrageweg und Modellwahl");
  await oeffne(cdp, "Schreiben.md");
  await waehleModell(cdp, FIM_MODEL);
  const c0 = fake.comp(), k0 = fake.chat();
  f0 = fake.fertig();
  await typeText(cdp, " ");
  await warteAufAntwort(cdp, fake, f0, 4000);
  const cFim = fake.comp() - c0, kFim = fake.chat() - k0;
  const modellFim = fake.letzte()?.model ?? null;
  // G14 — Modellwahl schlaegt Default (Lehre M2b): der Body traegt das gewaehlte, nicht das Default-Modell
  record("G14 Modellwahl schlaegt Default", modellFim === FIM_MODEL, `Body.model ${JSON.stringify(modellFim)} (erwartet ${JSON.stringify(FIM_MODEL)}, Endpunkt-Default ${JSON.stringify(CHAT_MODEL)}), Pfad ${fake.letzte()?.path ?? "-"}`);

  await oeffne(cdp, "Schreiben.md");
  await waehleModell(cdp, CHAT_MODEL);
  const c1 = fake.comp(), k1 = fake.chat();
  f0 = fake.fertig();
  await typeText(cdp, " ");
  await warteAufAntwort(cdp, fake, f0, 4000);
  const cChat = fake.comp() - c1, kChat = fake.chat() - k1;
  record("G13 Anfrageweg automatisch", cFim === 1 && kFim === 0 && kChat === 1 && cChat === 0, `${FIM_MODEL}: /v1/completions +${cFim}, /v1/chat/completions +${kFim} | ${CHAT_MODEL}: /v1/chat/completions +${kChat}, /v1/completions +${cChat}`);
  await setPluginSetting(cdp, PLUGIN_ID, "choice", { endpointId: "smoke" });
}

async function g15(cdp: Cdp, fake: FakeLlm): Promise<void> {
  let f0 = 0;
  console.log("\nG15 · Schluessel wird VOR dem Fensterschnitt geschwaerzt");
  const zeilen = schluesselZeilen();
  const dok = original("Schluessel.md");
  const key = dok.slice(dok.indexOf("-----BEGIN"), dok.indexOf("-----END") + "-----END RSA PRIVATE KEY-----".length);
  const nachKey = dok.length - dok.indexOf("-----END RSA PRIVATE KEY-----") - "-----END RSA PRIVATE KEY-----".length;
  await setPluginSetting(cdp, PLUGIN_ID, "contextChars", 300);
  await cdp.evaluate(`app.plugins.plugins[${q(PLUGIN_ID)}].targetPromise = null; return { ok: true };`);
  await oeffne(cdp, "Schluessel.md");
  const n0 = fake.chat() + fake.comp();
  f0 = fake.fertig();
  await typeText(cdp, " ");
  await warteAufAntwort(cdp, fake, f0, 4000);
  const aufz = fake.letzte();
  if (fake.chat() + fake.comp() === n0 || !aufz) { record("G15 Schluessel geschwaerzt", false, "der Fake sah keine Anfrage — nichts zu pruefen"); return; }
  const r = pruefeSchluesselBody(aufz.body, zeilen);
  const ok = r.durchgelassen === 0 && r.marke;
  record("G15 Schluessel geschwaerzt", ok, `Schluessel ${key.length} Zeichen (${zeilen.length} Koerperzeilen), Text hinter dem Schluessel ${nachKey} Zeichen, contextChars 300 → Fenster beginnt im Schluessel; Anfrage ${aufz.path} (${aufz.body.length} Zeichen): ${r.durchgelassen} von ${zeilen.length} Koerperzeilen durchgelassen, "${REDACT_MARK}" ${r.marke ? "vorhanden" : "FEHLT"}`);
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--setup")) { setupVault(); return; }
  const portArg = argv.indexOf("--port");
  const port = portArg >= 0 ? Number(argv[portArg + 1]) : 9363;
  const vaultArg = argv.indexOf("--vault");
  const vaultFilter = vaultArg >= 0 ? argv[vaultArg + 1] : REPO_NAME;

  selbsttestG15();
  const fake = await startFakeLlm();
  console.log(`Fake-LLM: ${fake.url}`);
  const cdp = await attachTo("workspace", port, vaultFilter);
  if (!cdp) { await fake.schliessen(); throw new Error(`Kein Obsidian-Fenster fuer Vault "${vaultFilter}" auf Port ${port}.`); }
  const warnungen: string[] = [];
  let manager = false;
  try {
    await cdp.mitschnitt((z) => { if (/error|exception/i.test(z)) warnungen.push(`Renderer: ${z}`); });
    await requireVisible(cdp);
    const v = await cdp.evaluate<{ name: string; basePath: string; configDir: string }>(`return { name: app.vault.getName(), basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };`);
    console.log(`Vault: ${v.name} (${v.basePath})`);
    requireEigenerBuild(join(v.basePath, v.configDir, "plugins", PLUGIN_ID, "main.js"), join(REPO_ROOT, "main.js"), (m) => warnungen.push(m));
    await grundlage(cdp, v.name);

    // Ausgangszustand VOR dem Lauf (Lehre 2026-10-01): Notizen, Einstellungen, Hotkey, Vim, Layout.
    await entferneHotkey(cdp);
    await cdp.evaluate(`app.vault.setConfig("vimMode", false); return { ok: true };`);
    await setzeNotizenZurueck(cdp);
    await setzeEinstellungenZurueck(cdp);
    await installFakeManager(cdp, fake.url);
    manager = true;
    await sleep(400);

    const spur = async (nach: string): Promise<void> => {
      if (!argv.includes("--spur")) return;
      await sleep(700);
      const st = await statusKlassen(cdp);
      console.log(`    [spur] nach ${nach}: ${st.cls.split(/\s+/).filter((c) => c.startsWith("is-")).join(" ")} | ${st.label ?? ""} | Fake chat ${fake.chat()} comp ${fake.comp()} unterwegs ${fake.unterwegs()}`);
    };
    await g1bis5(cdp, fake); await spur("G1-5");
    await g6(cdp, fake); await spur("G6");
    await g7(cdp, fake); await spur("G7");
    await g8(cdp, fake); await spur("G8");
    await g10(cdp, fake); await spur("G10");
    await g11(cdp, fake); await spur("G11");
    await g12(cdp, fake); await spur("G12");
    await g13und14(cdp, fake); await spur("G13/14");
    await g15(cdp, fake); await spur("G15");
    // Vim zuletzt: das Umschalten von vimMode laesst im laufenden Renderer Vim-Zustand zurueck
    // (gemessen im ersten Lauf: ein Rest davon veraenderte in G10 den Notiztext).
    await g9(cdp);
  } finally {
    await entferneHotkey(cdp).catch(() => undefined);
    await cdp.evaluate(`app.vault.setConfig("vimMode", false); return { ok: true };`).catch(() => undefined);
    if (manager) await removeFakeManager(cdp).catch(() => undefined);
    await setzeNotizenZurueck(cdp).catch(() => undefined);
    await setzeEinstellungenZurueck(cdp).catch(() => undefined);
    const n = await closeExtraLeaves(cdp).catch(() => 0);
    console.log(`\nAufgeraeumt: ${n} Leaves offen. Notices: ${await notices(cdp).catch(() => "?")}`);
    cdp.close();
    await fake.schliessen();
  }
  const gewollt = Array.from({ length: 15 }, (_, i) => `G${i + 1} `);
  for (const praefix of gewollt) {
    if (!checks.some((c) => c.name.startsWith(praefix))) nichtGemessen(praefix.trim(), "kein Ergebnis aufgezeichnet");
  }
  const zaehle = (z: Zustand): number => checks.filter((c) => c.zustand === z).length;
  const rot = checks.filter((c) => c.zustand === "rot");
  console.log(`\nSmoke ${zaehle("gruen")} gruen · ${rot.length} rot · ${zaehle("uebersprungen")} uebersprungen · ${zaehle("nichts gemessen")} nichts gemessen · von ${checks.length} Pruefpunkten`);
  for (const w of warnungen) console.log(`WARNUNG: ${w}`);
  if (rot.length) { console.log(`Rot: ${rot.map((r) => r.name).join(" · ")}`); process.exitCode = 1; }
}

main().catch((e: unknown) => { console.error(`\nABBRUCH: ${(e as Error).message}`); process.exitCode = 2; });

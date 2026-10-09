/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein LAUFENDES Obsidian (Zweitinstanz auf eigenem Port), statt die Bilder von Hand zu klicken.
 *
 * Die Bruecke kommt zentral aus dem Dach (`../../tools/obsidian-cdp/`). Dieser Treiber traegt nur das Rezept.
 *
 * Der Ghost-Text in den Bildern ist die ANTWORT EINES ECHTEN MODELLS: LM Studio auf localhost:1234 ueber das
 * echte Plugin llm-endpoint-manager. Kein Fake-Server, kein Fake-Manager. Der Treiber tippt nur ein Leerzeichen
 * ans Zeilenende (wie ein Nutzer) und wartet auf den Vorschlag. Ist kein Modell erreichbar, bricht er ab.
 *
 * ## Ablauf (Zweitinstanz, Profil und Port gehoeren der Session)
 *
 * ```bash
 * UD=/tmp/obs-test-ghostline-shots; mkdir -p "$UD"
 * lsof -nP -iTCP:<port> -sTCP:LISTEN; pgrep -f "user-data-dir=$UD"      # beides leer
 * npm run build && npm run shots -- --setup                              # Vault aus docs/images/fixture/
 * cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 * # obsidian.json: Vault eintragen und "lang":"en"; localStorage language "en" (der Treiber prueft)
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<port> &
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label ghostline --intent "shots.ts" --exclusive focus --port <port> --ttl 300
 * npm run shots -- --port <port>
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Je Bild ein frischer Prozess ist der sichere Weg (`--only <name>`); ein Sammellauf ist ein Versuch.
 */

import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

import { attachTo, Cdp, closeExtraLeaves, openExisting, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture, setWindowSize, writeShot, type Rect, type ShotOptions } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "ghostline";
const MANAGER_ID = "llm-endpoint-manager";
const REPO_NAME = "ghostline-shots";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const FENSTER_BREITE = 1200;
const FENSTER_HOEHE = 420;
const ENDPOINT_URL = "http://localhost:1234";
const MODEL = "qwen2.5-coder-7b";
/** Obergrenze fuer die Modellantwort (Kaltstart eines Modells kann dauern). */
const GHOST_MS = 60_000;

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  run(cdp: Cdp, port: number): Promise<Rect | null>;
}

const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Echter Endpunkt erreichbar? Ohne Modell keine Aufnahme (Auftrag: keine Attrappe). */
async function pruefeEndpunkt(): Promise<void> {
  // LM Studio ist geteilte Infrastruktur: die Modellliste wechselt zeitweise auf `local-model`, wenn eine andere
  // Session Modelle umbelegt (gemessen 2026-10-03). Deshalb bis zu 90 s wiederholen, nicht beim ersten Fehlgriff abbrechen.
  let grund = "";
  for (let i = 0; i < 18; i++) {
    try {
      const res = await fetch(`${ENDPOINT_URL}/v1/models`, { signal: AbortSignal.timeout(4000) });
      const data = (await res.json()) as { data?: { id: string }[] };
      if (data.data?.some((m) => m.id === MODEL)) return;
      grund = `Modell ${MODEL} fehlt in der Liste von ${ENDPOINT_URL}`;
    } catch (err) {
      grund = (err as Error).message;
    }
    await sleep(5000);
  }
  throw new Error(`Kein Modell erreichbar (${ENDPOINT_URL}, ${MODEL}): ${grund}. Es wird nicht mit einer Attrappe aufgenommen.`);
}

/** Notiz oeffnen, Cursor ans Dokumentende, Editor fokussiert, Ghost-frei. */
async function notizBereit(cdp: Cdp, pfad: string): Promise<boolean> {
  await cdp.send("Page.bringToFront");
  if (!(await openExisting(cdp, pfad, "source"))) return false;
  await closeExtraLeaves(cdp);
  await cdp.evaluate(`
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
    return true;
  `);
  await cdp.evaluate(`
    const ed = app.workspace.activeEditor?.editor;
    if (!ed) return false;
    ed.focus();
    const last = ed.lastLine();
    ed.setCursor({ line: last, ch: ed.getLine(last).length });
    return true;
  `);
  await sleep(600);
  return true;
}

/** Tippt wie ein Nutzer ein Leerzeichen und wartet auf den fertigen Vorschlag des Modells:
 *  Ghost da, Text seit 1,5 s unveraendert, Status nicht mehr `is-checking` (sonst dreht das Icon im Bild). */
async function vorschlagAbwarten(cdp: Cdp): Promise<string | null> {
  await cdp.send("Input.insertText", { text: " " });
  const t0 = Date.now();
  let letzter = "";
  let seit = Date.now();
  while (Date.now() - t0 < GHOST_MS) {
    const z = await cdp.evaluate<{ t: string; checking: boolean }>(`
      const g = document.querySelector(".workspace-leaf.mod-active .ghostline-ghost");
      return { t: g?.textContent ?? "", checking: !!document.querySelector(".ghostline-status.is-checking") };
    `);
    if (z.t !== letzter) { letzter = z.t; seit = Date.now(); }
    if (letzter.trim().length > 8 && !z.checking && Date.now() - seit > 1500) {
      console.log(`      · Vorschlag des Modells: ${JSON.stringify(letzter)}`);
      return letzter;
    }
    await sleep(200);
  }
  return null;
}

async function fensterBox(cdp: Cdp): Promise<Rect> {
  const box = await boxOf(cdp, ".app-container", 0);
  if (box) return box;
  return { x: 0, y: 0, width: FENSTER_BREITE, height: FENSTER_HOEHE };
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      if (!(await notizBereit(cdp, "Weekend in Lisbon.md"))) return null;
      if ((await vorschlagAbwarten(cdp)) === null) return null;
      return fensterBox(cdp);
    },
  },
  {
    name: "list-suggestion.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await notizBereit(cdp, "Team sync.md"))) return null;
      if ((await vorschlagAbwarten(cdp)) === null) return null;
      return fensterBox(cdp);
    },
  },
  {
    name: "next-word.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await notizBereit(cdp, "Project ideas.md"))) return null;
      if ((await vorschlagAbwarten(cdp)) === null) return null;
      // Pfeil rechts uebernimmt das naechste Wort — der Rest bleibt als Ghost stehen.
      const key = { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 0 };
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
      await sleep(1500);
      const rest = await cdp.evaluate<string>(`return document.querySelector(".workspace-leaf.mod-active .ghostline-ghost")?.textContent ?? "";`);
      if (rest.trim().length === 0) { console.log("      · nach Pfeil rechts bleibt kein Ghost-Rest stehen"); return null; }
      console.log(`      · Rest-Ghost: ${JSON.stringify(rest)}`);
      return fensterBox(cdp);
    },
  },
];

/** Einstellungen: eigenes Fenster (about:blank, ohne window.app). */
async function settingsBild(cdp: Cdp, port: number, opts: ShotOptions): Promise<string> {
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `);
  const fenster = await attachTo("settings", port, REPO_NAME);
  if (!fenster) return "settings.png — kein Einstellungen-Fenster gefunden";
  try {
    await fenster.send("Page.bringToFront");
    await setWindowSize(fenster, 1100, 1100);
    await sleep(600);
    // Der Tab scrollt intern und das Fenster ist durch den Bildschirm begrenzt: oben und unten getrennt aufnehmen
    // und im Renderer zusammensetzen, damit alle Gruppen (bis Request) im Bild stehen.
    const box = (await boxOf(fenster, ".vertical-tab-content", 0)) ?? (await boxOf(fenster, ".modal-content", 0));
    if (!box) return "settings.png — kein Inhaltsbereich im Einstellungen-Fenster";
    // In Schritten einer Sichthoehe abwaerts, bis das Ende erreicht ist; jede Aufnahme wird an ihre echte scrollTop gesetzt.
    // Das Bild reicht bis zum Ende des Tabs. Der Anfrage-Abschnitt der Verbindung (Kit) ist eingeklappt und zeigt nur
    // seine Kopfzeile; seine Zeilen haengen vom Endpunkt-Zustand ab und gehoeren nicht ins Bild.
    const schnitt = await fenster.evaluate<number>(`
      const el = document.querySelector(".vertical-tab-content");
      el.scrollTop = 0;
      return Math.round(el.scrollHeight);
    `);
    if (schnitt < 200) return "settings.png — Tab-Inhalt zu kurz, Schnitt nicht moeglich";
    const teile: { png: Buffer; top: number }[] = [];
    let ziel = 0;
    for (let i = 0; i < 12; i++) {
      const top = await fenster.evaluate<{ top: number; max: number }>(`
        const el = document.querySelector(".vertical-tab-content");
        el.scrollTop = ${ziel};
        return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
      `);
      await sleep(450);
      teile.push({ png: await capture(fenster, box, 2), top: top.top });
      if (top.top >= top.max - 1 || top.top + box.height >= schnitt) break;
      ziel = top.top + Math.floor(box.height) - 40;
    }
    const b64 = await fenster.evaluate<string>(`
      const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + b64; });
      const teile = ${JSON.stringify(teile.map((t) => ({ b: t.png.toString("base64"), top: t.top })))};
      const bilder = await Promise.all(teile.map((t) => load(t.b)));
      const k = bilder[0].width / ${box.width};
      const c = document.createElement("canvas");
      c.width = bilder[0].width;
      c.height = Math.round(${schnitt} * k);
      const g = c.getContext("2d");
      bilder.forEach((img, i) => g.drawImage(img, 0, Math.round(teile[i].top * k)));
      return c.toDataURL("image/png").split(",")[1];
    `);
    const png = Buffer.from(b64, "base64");
    return await writeShot(fenster, "settings.png", png, { ...opts, thumb: true });
  } finally {
    await fenster.evaluate("window.close(); return true;").catch(() => undefined);
    fenster.close();
  }
}

/** --setup: Vault aus dem Fixture, dazu der echte Manager mit einem Endpunkt und die Plugin-Wahl. */
function setup(repoRoot: string): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  console.log(`Aufnahme-Vault: ${vaultDir}`);
  for (const zeile of buildVault({ repoRoot, vaultDir, fixtureDir: join(repoRoot, "docs/images/fixture"), pluginId: PLUGIN_ID })) {
    console.log(`  ${zeile}`);
  }
  const managerRepo = join(repoRoot, "..", "llm-endpoint-manager");
  const managerDir = join(vaultDir, ".obsidian", "plugins", MANAGER_ID);
  mkdirSync(managerDir, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(join(managerRepo, f))) throw new Error(`${join(managerRepo, f)} fehlt — erst dort bauen`);
    cpSync(join(managerRepo, f), join(managerDir, f));
  }
  writeFileSync(join(managerDir, "data.json"), JSON.stringify({
    version: 1,
    endpoints: [{ id: "lm-studio", label: "LM Studio", url: ENDPOINT_URL, provider: "openai", capabilities: ["chat"], enabled: true, model: MODEL }],
  }, null, 2));
  writeFileSync(join(vaultDir, ".obsidian", "plugins", PLUGIN_ID, "data.json"), JSON.stringify({
    choice: { endpointId: "lm-studio", model: MODEL },
  }, null, 2));
  console.log(`  llm-endpoint-manager aus ${managerRepo} kopiert, Endpunkt LM Studio (${ENDPOINT_URL}), Modell ${MODEL}`);
  console.log("\nJetzt: Profil, .asar, obsidian.json (Vault + lang en), Start, Vertrauensdialog — siehe Dateikopf.");
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log("  detail   settings.png");
    return;
  }
  if (argv.includes("--setup")) { setup(repoRoot); return; }

  const port = Number(flag("--port"));
  if (!Number.isInteger(port) || port < 1024) throw new Error("--port <Zahl> fehlt (Port der eigenen Zweitinstanz).");
  const nur = flag("--only");
  await pruefeEndpunkt();
  mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.`);
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => { if (/error|exception/i.test(zeile)) console.log(`      » ${zeile}`); });
  await cdp.send("Page.bringToFront");
  await sleep(3000);
  await requireVisible(cdp);

  const sprache = await cdp.evaluate<string>(`return window.moment ? window.moment.locale() : "?";`);
  if (!sprache.startsWith("en")) throw new Error(`Oberflaeche ist "${sprache}", nicht Englisch — obsidian.json UND localStorage["language"] auf "en", dann Neustart.`);
  await cdp.evaluate(`if (app.plugins.setEnable) await app.plugins.setEnable(true); return true;`);
  const da = await pollUntil<boolean>(cdp, `return !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] && !!app.plugins.plugins[${JSON.stringify(MANAGER_ID)}];`, 15_000, 300);
  if (!da) throw new Error("Ghostline und/oder llm-endpoint-manager sind nicht geladen (Restricted Mode? Vertrauensdialog?).");

  await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
  await sleep(800);

  let ok = 0;
  let fehlend = 0;
  const opts: ShotOptions = { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH };
  for (const shot of SHOTS) {
    if (nur && shot.name !== nur) continue;
    try {
      const box = await shot.run(cdp, port);
      const png = box ? await capture(cdp, box, 2) : null;
      if (!png) { console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`); fehlend++; continue; }
      console.log(`  ✓ ${await writeShot(cdp, shot.name, png, { ...opts, thumb: shot.klasse === "detail" })}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
      fehlend++;
    }
  }
  if (!nur || nur === "settings.png") console.log(`  · ${await settingsBild(cdp, port, opts)}`);

  cdp.close();
  console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
  if (fehlend) exit(1);
}

main().catch((err: Error) => { console.error(err.message); exit(1); });

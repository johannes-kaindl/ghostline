/**
 * Sequenz-Aufnahme fuer Ghostline — Tippen, Pause, Vorschlag des Modells, Tab, als Bildfolge mit Eingabe-Log.
 *
 * Was eine Sequenz zeigen muss, steht in `docs/images/README.md` § Sequenzen (Aufnahme-Vertrag); dieser Treiber ist
 * das Rezept. Bruecke und Log-Vertrag: `tools/obsidian-cdp/README.md` § Sequenz. Vorbild: `neurovim-obsidian/scripts/sequenz.ts`.
 *
 * Der Vorschlag in den Bildern ist die ANTWORT EINES ECHTEN MODELLS (LM Studio, ueber den echten llm-endpoint-manager),
 * wie bei den Standbildern von `shots.ts`; kein Fake-Server, kein Fake-Manager. Ist kein Modell erreichbar, bricht der Lauf ab.
 *
 * Die Wartezeit auf das Modell ist echte Latenz. Sie steht als eigener Schritt `VORSCHLAG` im Log (Ziel `ghost`) und,
 * gemessen, in `sequenz.json` → `herkunft.wartezeit_ms`; ob ein Clip sie kuerzt, entscheidet die Komposition (clipwerk).
 *
 * ## Ablauf (Zweitinstanz, eigener Port, Lock je Port — Dach-AGENTS.md § Staging-Vaults)
 *
 * ```bash
 * npm run build && npm run shots -- --setup       # derselbe Vault wie fuer die Standbilder (ghostline-shots, mit Manager und Endpunkt)
 * # Zweitinstanz starten (Profil, .asar, obsidian.json, Lock) — siehe docs/images/README.md § Rezept
 * npm run sequenz -- --port 9361                  # --port ist Pflicht, es gibt keinen Standardport
 * npm run sequenz -- --port 9361 --sequenz lisbon-tippen --out out/sequenz
 * ```
 *
 * Ergebnis: `out/sequenz/<name>/` (Einzelbilder, eingaben.jsonl, sequenz.json; gitignored). Der Arbeitsbaum muss sauber sein,
 * weil `herkunft.commit` sonst den Stand nicht beschreibt (CORE-META-22); nur fuer Messlaeufe: `--herkunft-unsauber`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd } from "node:process";

import { Vorbedingung } from "../../tools/obsidian-cdp/bilanz.js";
import { attachTo, bereiteInstanzVor, clearNotices, closeExtraLeaves, openExisting, pollUntil, requireVisible, setAppConfig, type Cdp } from "../../tools/obsidian-cdp/cdp.js";
import { boxAround, setWindowSize, type Rect } from "../../tools/obsidian-cdp/shot.js";
import { type AktionsKontext, type Schritt } from "../../tools/obsidian-cdp/sequenz.js";
import { aufnehmen, ergebnisSchreiben, messzeile } from "../../tools/obsidian-cdp/sequenz-aufnahme.js";

const PLUGIN_ID = "ghostline";
const MANAGER_ID = "llm-endpoint-manager";
const REPO_NAME = "ghostline-shots";
const ENDPOINT_URL = "http://localhost:1234";
const MODEL = "qwen2.5-coder-7b";
/** Fensterbreite wie die Standbilder; Hoehe wie `hero.png` (der Text endet frueh, darunter bliebe nur Leere). */
const FENSTER_BREITE = 1200;
const FENSTER_HOEHE = 360;
/** Obergrenze fuer die Modellantwort (Kaltstart eines Modells kann dauern). */
const GHOST_MS = 60_000;
/** Der Vorschlag gilt als fertig, wenn sein Text so lange unveraendert steht (wie in `shots.ts`). */
const RUHE_MS = 1500;
/** Schriftgroesse des Editors: im Clip wird das Bild verkleinert, bei 16 px lag das Ruhebild unter der Lesegrenze (clipwerk BEFUND). */
const SCHRIFT = 20;
const ANSCHLAG = 0.1;
const VORHALT = 0.8;

const REPO_ROOT = cwd();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const arg = (name: string, fallback?: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]?.startsWith("--") ? argv[i + 1] : fallback;
};

/** Was die Schritte unterwegs messen; geht am Ende in `herkunft`. */
interface Stand { vorschlag: string; wartezeitMs: number | null; ghostDanach: string }

/** Wartet auf den fertigen Vorschlag: Ghost da, Text seit `RUHE_MS` unveraendert, Status nicht mehr `is-checking`. */
const warteAufVorschlag = (stand: Stand) => async (k: AktionsKontext): Promise<void> => {
  const t0 = Date.now();
  let letzter = "";
  let seit = Date.now();
  while (Date.now() - t0 < GHOST_MS) {
    const z = await k.evaluate<{ t: string; checking: boolean }>(`
      const g = document.querySelector(".workspace-leaf.mod-active .ghostline-ghost");
      return { t: g?.textContent ?? "", checking: !!document.querySelector(".ghostline-status.is-checking") };
    `);
    if (z.t !== letzter) { letzter = z.t; seit = Date.now(); }
    if (letzter.trim().length > 8 && !z.checking && Date.now() - seit > RUHE_MS) {
      stand.vorschlag = letzter;
      // Wartezeit ohne die Ruhefrist: ab dem Bild nach dem Leerzeichen bis zum letzten Wechsel des Ghost-Textes.
      stand.wartezeitMs = seit - t0;
      return;
    }
    await sleep(200);
  }
  throw new Vorbedingung(`Kein Vorschlag nach ${GHOST_MS / 1000} s (${ENDPOINT_URL}, ${MODEL}). Es wird nicht mit einer Attrappe aufgenommen.`);
};

interface Sequenz { name: string; notiz: string; kuerzen: string; schritte: (stand: Stand) => Schritt[]; soll: (cdp: Cdp, stand: Stand, vorher: string) => Promise<string | null> }

/** Das Wort, das getippt wird; die Fixture-Notiz endet auf `In the evening we`, der Treiber entfernt es vor dem Start. */
const TIPPEN = "evening we";

/** Der Hero-Ablauf des README-Clips: ein Satzende tippen, innehalten, Vorschlag des Modells abwarten, Tab uebernimmt ihn. */
const LISBON_TIPPEN: Sequenz = {
  name: "lisbon-tippen",
  notiz: "Weekend in Lisbon.md",
  kuerzen: TIPPEN,
  schritte: (stand) => [
    { key: "evening", kind: "text", target: "editor", halt: 0.05 },
    { key: "Space", kind: "key", target: "editor", halt: 0.05 },
    { key: "we", kind: "text", target: "editor", halt: 0.05 },
    { key: "Space", kind: "key", target: "editor", halt: 0.2 },
    { key: "VORSCHLAG", kind: "key", target: "ghost", halt: 0.6, aktion: warteAufVorschlag(stand) },
    { key: "Tab", kind: "key", target: "editor", halt: 0.4 },
  ],
  soll: async (cdp, stand, vorher) => {
    const nachher = await dokumentText(cdp);
    const erwartet = `${vorher}${TIPPEN} ${stand.vorschlag}`;
    if (nachher.trimEnd() !== erwartet.trimEnd()) return `Dokument endet ${JSON.stringify(nachher.slice(-80))}, erwartet ${JSON.stringify(erwartet.slice(-80))}`;
    // Beobachtet am 2026-11-05: nach Tab stand bei einem Lauf mit Halt 1,6 s wieder ein Ghost. Ursache nicht geklaert; das Bild nach Tab
    // entsteht sofort nach der Taste, was danach steht, geht als Messwert in `herkunft.ghost_nach_tab`.
    stand.ghostDanach = await cdp.evaluate<string>(`return document.querySelector(".workspace-leaf.mod-active .ghostline-ghost")?.textContent ?? "";`);
    return null;
  },
};

const SEQUENZEN: Sequenz[] = [LISBON_TIPPEN];

async function dokumentText(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`return app.workspace.activeEditor?.editor?.getValue() ?? "";`);
}

/** Echter Endpunkt erreichbar? Ohne Modell keine Aufnahme (keine Attrappe). */
async function pruefeEndpunkt(): Promise<void> {
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
  throw new Vorbedingung(`Kein Modell erreichbar (${ENDPOINT_URL}, ${MODEL}): ${grund}. Es wird nicht mit einer Attrappe aufgenommen.`);
}

/** Notiz oeffnen, Seitenleisten zu, Cursor ans Dokumentende, Editor fokussiert, kein Ghost vorhanden. */
async function notizBereit(cdp: Cdp, pfad: string, kuerzen: string): Promise<void> {
  await cdp.send("Page.bringToFront");
  if (!(await openExisting(cdp, pfad, "source"))) throw new Vorbedingung(`Notiz ${pfad} nicht zu oeffnen.`);
  await closeExtraLeaves(cdp);
  await cdp.evaluate(`app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); return true;`);
  const ok = await cdp.evaluate<boolean>(`
    const ed = app.workspace.activeEditor?.editor;
    if (!ed) return false;
    ed.focus();
    const last = ed.lastLine();
    const zeile = ed.getLine(last);
    const kuerzen = ${JSON.stringify(kuerzen)};
    if (kuerzen) {
      if (!zeile.endsWith(kuerzen)) return false;
      ed.replaceRange("", { line: last, ch: zeile.length - kuerzen.length }, { line: last, ch: zeile.length });
    }
    ed.setCursor({ line: last, ch: ed.getLine(last).length });
    await new Promise((r) => setTimeout(r, 400));
    return Boolean(document.activeElement && app.workspace.activeEditor.editor.cm.contentDOM.contains(document.activeElement));
  `);
  if (!ok) throw new Vorbedingung(`Editor ohne Fokus oder die letzte Zeile endet nicht auf ${JSON.stringify(kuerzen)}.`);
  // Das Entfernen kann einen Vorschlag anstossen: abwarten und, falls einer steht, mit Escape verwerfen (wie ein Nutzer).
  await sleep(2500);
  const dazwischen = await cdp.evaluate<string>(`return document.querySelector(".workspace-leaf.mod-active .ghostline-ghost")?.textContent ?? "";`);
  if (dazwischen.trim() !== "") {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(800);
  }
  const ghost = await cdp.evaluate<string>(`return document.querySelector(".workspace-leaf.mod-active .ghostline-ghost")?.textContent ?? "";`);
  if (ghost.trim() !== "") throw new Vorbedingung(`Vor dem Start steht schon ein Ghost: ${JSON.stringify(ghost)}.`);
}

/** Geaenderte oder unversionierte Dateien im Repo (ohne ignorierte). Leer = der Commit beschreibt den Stand. */
function arbeitsbaumUnsauber(): string[] {
  return execFileSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf-8" })
    .split("\n").filter((z) => z.trim().length > 0).map((z) => z.slice(3));
}

async function herkunft(cdp: Cdp, unsauber: string[]): Promise<Record<string, unknown>> {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "manifest.json"), "utf-8")) as { version: string };
  const manager = JSON.parse(readFileSync(join(REPO_ROOT, "..", MANAGER_ID, "manifest.json"), "utf-8")) as { version: string };
  // Nicht `remote.app.getVersion()`: das ist die GEBUENDELTE Version der .app, der Renderer laeuft mit der .asar im Profil.
  const obsidian = await cdp.evaluate<string>("return (document.title.match(/Obsidian (\\d+\\.\\d+\\.\\d+)/) || [])[1] || '';");
  if (!obsidian) throw new Vorbedingung(`Obsidian-Version nicht aus dem Fenstertitel lesbar (${JSON.stringify(await cdp.evaluate<string>("return document.title;"))}).`);
  return {
    repo: "ghostline", commit, unsauber, plugin_version: manifest.version, license: "AGPL-3.0-or-later",
    manager_version: manager.version, modell: MODEL, endpunkt: "LM Studio, lokal", theme: "Standard (Obsidian)", schrift_px: SCHRIFT,
    obsidian_version: obsidian, fixture: "docs/images/fixture",
    inhalt: "Fixture-Notiz, Text des Vorschlags: Antwort des Modells",
  };
}

/** Schriftgroesse im laufenden Fenster. Gemessen 2026-10-14 (neurovim-obsidian): `setConfig("baseFontSize")` allein aendert
 *  `--font-text-size` am Body nicht, deshalb wird die Variable selbst gesetzt; die Konfiguration zieht mit. */
async function setzeSchrift(cdp: Cdp, px: number): Promise<void> {
  await setAppConfig(cdp, "baseFontSize", px);
  await cdp.evaluate(`document.body.style.setProperty("--font-text-size", ${px} + "px"); await new Promise((r) => setTimeout(r, 600)); return true;`);
}

async function main(): Promise<void> {
  const name = arg("sequenz", LISBON_TIPPEN.name);
  const sequenz = SEQUENZEN.find((s) => s.name === name);
  if (!sequenz) { console.error(`Unbekannte Sequenz ${name}; bekannt: ${SEQUENZEN.map((s) => s.name).join(", ")}`); process.exitCode = 2; return; }
  const port = Number(arg("port", ""));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error("⛔ --port <1024-65535> ist Pflicht (Port deiner Zweitinstanz, vom Lock gehalten) — es gibt keinen Standardport.");
    process.exitCode = 2;
    return;
  }
  const outDir = join(REPO_ROOT, arg("out", "out/sequenz") as string, sequenz.name);
  const unsauber = arbeitsbaumUnsauber();
  if (unsauber.length > 0 && !argv.includes("--herkunft-unsauber")) {
    console.error(`⛔ Arbeitsbaum unsauber — die Herkunft (Commit) wuerde den Stand nicht beschreiben:\n   ${unsauber.join("\n   ")}\n   Erst committen; nur fuer Messlaeufe: --herkunft-unsauber.`);
    process.exitCode = 2;
    return;
  }

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    console.error(`⛔ Kein Obsidian-Fenster auf Port ${port} mit Vault "${REPO_NAME}". Zweitinstanz starten (docs/images/README.md § Rezept).`);
    process.exitCode = 2;
    return;
  }
  try {
    await pruefeEndpunkt();
    // Ohne sichtbares Fenster (visibilityState hidden) laeuft der Debounce des Plugins nicht an: es kommt kein Vorschlag.
    await cdp.send("Page.bringToFront");
    await sleep(3000);
    await requireVisible(cdp);
    await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID, MANAGER_ID], nurVault: REPO_NAME, sprache: "en" });
    const da = await pollUntil<boolean>(cdp, `return !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] && !!app.plugins.plugins[${JSON.stringify(MANAGER_ID)}];`, 15_000, 300);
    if (!da) throw new Vorbedingung("Ghostline und/oder llm-endpoint-manager sind nicht geladen (Restricted Mode? Vertrauensdialog?).");
    await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
    await sleep(800);
    await setzeSchrift(cdp, SCHRIFT);
    await notizBereit(cdp, sequenz.notiz, sequenz.kuerzen);
    const vorher = await dokumentText(cdp);
    await clearNotices(cdp);
    await sleep(300);

    const roh = await boxAround(cdp, [".workspace-leaf.mod-active .cm-editor", ".status-bar"], 8);
    if (!roh) throw new Vorbedingung("Zuschnitt (Editor + Statusleiste) nicht bestimmbar.");
    // Das Polster darf nicht ueber das Fenster hinausragen: dort entsteht ein schwarzer Streifen (gemessen 2026-11-05, 8 px).
    const fenster = await cdp.evaluate<{ w: number; h: number }>("return { w: window.innerWidth, h: window.innerHeight };");
    const clip: Rect = { x: roh.x, y: roh.y, width: Math.min(roh.width, fenster.w - roh.x), height: Math.min(roh.height, fenster.h - roh.y) };

    const stand: Stand = { vorschlag: "", wartezeitMs: null, ghostDanach: "" };
    const herk = await herkunft(cdp, unsauber);
    const ergebnis = await aufnehmen(cdp, sequenz.name, sequenz.schritte(stand), {
      outDir, modus: "schritt", clip, scale: 2, anschlag: ANSCHLAG, vorhalt: VORHALT, herkunft: herk,
    });
    const fehler = await sequenz.soll(cdp, stand, vorher);
    if (fehler) throw new Vorbedingung(`Sequenz ${sequenz.name} hat nicht gewirkt: ${fehler}`);
    herk.vorschlag = stand.vorschlag;
    herk.wartezeit_ms = stand.wartezeitMs;
    herk.ghost_nach_tab = stand.ghostDanach;
    console.log(`✅ ${ergebnisSchreiben(outDir, ergebnis)}`);
    console.log(`   ${messzeile(join(outDir, "sequenz.json"))}`);
    console.log(`   Vorschlag des Modells: ${JSON.stringify(stand.vorschlag)} (Wartezeit ${stand.wartezeitMs} ms)`);
    console.log("\nJetzt die Bilder ANSEHEN — der Standard prueft die Form, nie die Aussage.");
  } catch (err) {
    if (err instanceof Vorbedingung) {
      console.error(`\n⛔ Abbruch — Voraussetzung nicht erfuellt:\n   ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  } finally {
    cdp.close();
  }
}

void main();

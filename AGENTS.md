# AGENTS — ghostline

## Project character

Ghostline ist ein Obsidian-Plugin (ID `ghostline`, desktop-only, `minAppVersion` 1.11.4): Inline-Ghost-Text-Vervollständigung für die aktuelle Zeile, betrieben von einem lokalen LLM; Tab übernimmt den Vorschlag. Spec und Plan liegen im Cockpit `25_Coding/ghostline/_SDD/`. Dach-Regeln (Kit-first, Zuständigkeit, UI-STANDARD): `../AGENTS.md`.

Zuständigkeit: Ghostline besitzt die Zeilenvervollständigung im Editor. Endpunkte, Schlüssel und Modell-Listen gehören dem `llm-endpoint-manager`, Retrieval `vault-rag`, das offene Gespräch Koda. Ghostline baut davon nichts nach.

## Architecture principles

- `src/core/` ist rein: weder `obsidian` noch `@codemirror/*` (bewacht von `npm run check:pure`). Dort liegen Kontext, Prompt, Nachbearbeitung, Auslöser, Ausschluss, Settings-Modell.
- Kit-Code liegt vendored unter `src/vendor/` und `tests/vendor/` (Konfiguration `tools/kit-sync.json`, Aufruf `bash tools/sync-kit.sh`, Prüfung mit `--check`); nie von Hand editiert, Pins nur in der Konfiguration. Aktuell obsidian-kit 0.51.3 und code-kit 0.15.4 (alle Module auf derselben Ref).
- Settings gehen ausschließlich durch `normalizeSettings` (`src/core/settings.ts`): Whitelist, Zahlen geklemmt, nie eine URL oder ein Schlüssel in `data.json`.
- Endpunkt, Token und Modell-Liste kommen vom `llm-endpoint-manager` über das Kit-Modul `endpoint-source`; Schlüssel liegen im Obsidian-Schlüsselbund. Grund für `minAppVersion` 1.11.4: das Kit-Modul `secrets` braucht `app.secretStorage` (Lint-Regel `no-unsupported-api`); Master hat das am 2026-10-03 bestätigt, der Plan nannte 1.8.7.
- Sampling schreibt das Plugin nie fest: `completeParams` (`src/llm/paths.ts`) löst die FIM-Werte aus der Kit-Tabelle `sampling-profiles`, Modus `complete`; der Chat-Pfad bekommt sie von der Kit-Verbindung (`createLlmConnection`, `managerOnly`, `llm.complete`). Keine feste Temperatur im Plugin-Code. Der FIM-Pfad meldet über `llm.session` (`recordRequest`, `report`), der Chat-Pfad über die Verbindung selbst, damit es eine Sitzung gibt.
- Zwei Anfragewege hinter einer Schnittstelle (`CompletionPath`): Chat über den Kit-Chat-Client, FIM über den eigenen schmalen Client `src/llm/fim-client.ts` (Kit-Kandidat ab dem zweiten Konsumenten). FIM gibt es nur für Familien mit gemessenem Eintrag in `FIM_TEMPLATES` (aktuell Qwen2.5-Coder).
- Die Session erzwingt die Gesamtfrist je Anfrage selbst (`REQUEST_DEADLINE_MS`), weil der FIM-Client keinen Leerlauf-Timeout kennt.

## Commands

- `npm run gate` — lint, typecheck (src, test, scripts), test, check:pure, build; muss 0 Fehler und 0 Warnungen liefern. Vor jedem Commit, mit `&&` verkettet.
- `npm run smoke:gui -- --port <n>` — GUI-Smoke G1–G20 gegen eine Zweitinstanz von Obsidian. Rezept (Profil, Port, Lock, Restricted Mode, Vertrauensdialog, `--setup` für den Staging-Vault) steht im Kopfkommentar von `scripts/gui-smoke.ts`; Prüfpunkte in `docs/internal/SMOKE.md`. Je Messlauf ein frischer Obsidian-Prozess, Lock für den eigenen Port, `release` direkt nach dem Lauf.
- `npm run latency -- --endpoint <url> --models a,b --runs 5` — Latenzmessung (`scripts/latency.ts`, Spec § 9.5). **Nur nach Absprache mit dem Master**: JIT in LM Studio lädt Modelle und verdrängt die anderer Sessions. Nie im Gate, nie von Tests aufgerufen; die reinen Teile (`scripts/latency-lib.ts`) prüft `tests/latency-lib.test.ts`.
- `npm run deploy` — baut und kopiert nach `$OBSIDIAN_PLUGIN_DIR`.
- `npm run release` — delegiert an `../tools/release/`; fährt der Master nach Freigabe durch Johannes.

## Conventions

- Conventional Commits, Commit nur mit expliziten Pfaden, Gate vor jedem Commit.
- Texte nur in `src/i18n/strings.ts`, Schlüssel immer in `en` und `de`.
- Styles nur mit Theme-Variablen (UI-STANDARD §3).
- Beim Schreiben (Tippen) erscheint nie eine Notice; Fehler gehen in die Statusleiste.
- Markdown: ein Absatz, eine Zeile.
- `noUncheckedIndexedAccess` ist an.

## Gotchas

- `@codemirror/state` und `@codemirror/view` sind in `esbuild.config.mjs` als `external` gesetzt: Obsidian liefert CM6 zur Laufzeit, gebündelt entstünde eine zweite Instanz.
- Die `package.json` pinnt `@codemirror/state` (6.5.0) und `@codemirror/view` (6.38.6) exakt, weil `obsidian` den State als exakte Peer-Version verlangt.
- **Restgrenze der Schwärzung (Spec § 8, dokumentiert in `docs/explanation/privacy.md`):** `buildContext` schwärzt VOR dem Fensterschnitt und entfernt auch verwaiste Schlüssel-Hälften. Sitzt der Cursor aber in einem PEM-Block, der größer ist als das untersuchte Fenster (`max(contextChars*3, 16384)` + 512 Zeichen davor), ist das Mittelstück nicht erkennbar und geht im Klartext hinaus. Die Reihenfolge schwärzen-dann-schneiden nie umkehren; G15 im Smoke bewacht sie.
- **G10:** Ein vom Nutzer auf `ghostline:accept` gelegtes Hotkey wird von Obsidian auch ohne sichtbaren Vorschlag verschluckt. Das ist eine Messung, kein Plugin-Fehler; die Doku rät, die Accept-Befehle nicht auf anderweitig gebrauchte Tasten zu legen. Tab, Pfeil rechts und Escape gehen nur bei sichtbarem Ghost durch den Plugin-Handler.
- **Lehren aus dem Review-Fokus des Plans** (jede hat einen Test, der sie hält): (1) Tab ohne sichtbaren Vorschlag muss in einer Liste einrücken, auch direkt nach einem verworfenen Vorschlag (`ghost-keymap.test.ts`, G7). (2) Eine Antwort, die nach dem Abbruch eintrifft, darf keinen Ghost an einer alten Position zeigen (`requestId`-Prüfung in `suggestion.ts` und Session). (3) Dollarbeträge im Fließtext sind keine Formel (`context-type.test.ts`). (4) Ein Notizpfad mit Unterordnern unter einer Freigabe-Regel (`*` + `!Notes/**`) bleibt aktiv, `Clippings/x.md` nicht (`exclusion.test.ts`). (5) Wiederholt das Modell den Satzanfang, fällt die Wiederholung weg und die Naht hat genau ein Leerzeichen (`postprocess.test.ts`).
- Der Ausschluss-Cache merkt sich auch `false`, solange die Metadaten einer Notiz nicht geladen sind; `invalidate()` hängt an `metadataCache` `changed` und `resolved`.
- Eine Cursorbewegung löst selbst einen Vorschlag aus; Smoke-Messungen beginnen deshalb erst nach einer Ruhephase und verwerfen den Ghost per Escape.
- Das Plugin trägt keine eigene Endpunkt-Liste. Fehlt der Manager, zeigt die Statusleiste „kein Endpunkt“ und ein Klick öffnet die Settings.

## Memory

Befunde und Entscheidungen stehen im Cockpit `25_Coding/ghostline/`; hier nur, was für jede Session im Repo gilt.

## Abweichungen von der Leitkonvention

- UI-STANDARD §5 (Settings über `mergeSettings`): stattdessen `normalizeSettings` mit Whitelist, weil `mergeSettings` Defaults auffüllt, aber Fremdfelder nicht verwirft; die Whitelist ist die Datenschutz-Zusage aus Spec § 8.1. gilt-solange: mergeSettings keine Whitelist kennt

# AGENTS — ghostline

## Project character

Ghostline ist ein Obsidian-Plugin (ID `ghostline`, desktop-only): Inline-Ghost-Text-Vervollständigung für die aktuelle Zeile, betrieben von einem lokalen LLM; Tab übernimmt den Vorschlag. Spec und Plan liegen im Cockpit `25_Coding/ghostline/_SDD/`. Dach-Regeln (Kit-first, Zuständigkeit, UI-STANDARD): `../AGENTS.md`.

## Architecture principles

- `src/core/` ist rein: weder `obsidian` noch `@codemirror/*` (bewacht von `npm run check:pure`).
- Kit-Code liegt vendored unter `src/vendor/` und `tests/vendor/` (Konfiguration `tools/kit-sync.json`, Aufruf `bash tools/sync-kit.sh`, Prüfung mit `--check`); nie von Hand editiert, Pins nur in der Konfiguration.
- Settings gehen ausschließlich durch `normalizeSettings` (`src/core/settings.ts`): Whitelist, Zahlen geklemmt, nie eine URL oder ein Schlüssel in `data.json`.
- Endpunkt, Token und Modell-Liste kommen vom `llm-endpoint-manager` über das Kit-Modul `endpoint-source`.

## Commands

- `npm run gate` — lint, typecheck (src, test, scripts), test, check:pure, build; muss 0 Fehler und 0 Warnungen liefern.
- `npm run smoke:gui` — GUI-Smoke gegen ein laufendes Obsidian (Lock und Zweitinstanz laut Dach-`AGENTS.md`).
- `npm run latency` — Latenzmessung gegen den konfigurierten Endpunkt.

## Conventions

- Conventional Commits, Commit nur mit expliziten Pfaden, Gate vor jedem Commit.
- Texte nur in `src/i18n/strings.ts`, Schlüssel immer in `en` und `de`.
- Styles nur mit Theme-Variablen (UI-STANDARD §3).
- Markdown: ein Absatz, eine Zeile.

## Gotchas

- `@codemirror/state` und `@codemirror/view` sind in `esbuild.config.mjs` als `external` gesetzt: Obsidian liefert CM6 zur Laufzeit, gebündelt entstünde eine zweite Instanz.
- Die `package.json` pinnt `@codemirror/state` (6.5.0) und `@codemirror/view` (6.38.6) exakt, weil `obsidian` den State als exakte Peer-Version verlangt.
- Beim Schreiben (Tippen) erscheint nie eine Notice.

## Memory

Befunde und Entscheidungen stehen im Cockpit `25_Coding/ghostline/`; hier nur, was für jede Session im Repo gilt.

## Abweichungen von der Leitkonvention

- UI-STANDARD §5 (Settings über `mergeSettings`): stattdessen `normalizeSettings` mit Whitelist, weil `mergeSettings` Defaults auffüllt, aber Fremdfelder nicht verwirft; die Whitelist ist die Datenschutz-Zusage aus Spec § 8.1. gilt-solange: mergeSettings keine Whitelist kennt

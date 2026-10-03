# Ghostline

> [🇬🇧 English](https://github.com/johannes-kaindl/ghostline/blob/main/README.md) · 🇩🇪 Deutsch

**Inline-Ghost-Text-Vervollständigung für die aktuelle Zeile, angetrieben von einem lokalen LLM. Tab übernimmt.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/ghostline?label=release)](https://github.com/johannes-kaindl/ghostline/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.11.4%2B%20·%20desktop-7c3aed)

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/hero.png" width="820" alt="Eine Notiz im Editor mit grauem Ghost-Text-Vorschlag, der den letzten Satz weiterführt"></p>

Während du schreibst, wartet Ghostline eine kurze Pause ab, fragt ein lokales Modell, wie die aktuelle Zeile weitergehen könnte, und zeigt die Antwort als graue Schrift hinter dem Cursor. Tab übernimmt sie, Escape verwirft sie. Nichts verlässt deinen Rechner, solange du nicht selbst einen entfernten Endpunkt einträgst.

## Features

- **Ghost-Text am Cursor.** Ein grauer Vorschlag für den Rest der aktuellen Zeile, nach einer kurzen Pause eingeblendet; Tab übernimmt ihn ganz (oder wortweise), Escape verwirft ihn.
- **Lokal zuerst.** Der Text geht nur an den Endpunkt und das Modell, die du gewählt hast, in der Regel ein Server auf deinem eigenen Rechner. Offensichtliche Geheimnisse (private Schlüssel, E-Mail-Adressen, Tokens) werden vor dem Senden durch eine Markierung ersetzt.
- **Chat oder Fill-in-the-Middle.** „Automatisch“ nutzt Fill-in-the-Middle (FIM) für Modellfamilien mit bekannter Vorlage und Chat für alles andere.
- **Ausschließbar.** Ordner, Dateien oder einzelne Notizen lassen sich per Muster oder mit `ghostline: false` in den Eigenschaften einer Notiz vom Modell fernhalten.
- **Endpunkte an einer Stelle.** Endpunkte, Schlüssel und Modellliste kommen vom LLM Endpoint Manager; Ghostline führt weder eine eigene Liste noch eigene Schlüssel.

## Requirements

- **Obsidian 1.11.4+, nur Desktop.** Die Endpunkt-Schlüssel liegen im Schlüsselbund von Obsidian, wofür ab dieser Version `app.secretStorage` nötig ist.
- **Das Plugin LLM Endpoint Manager.** Ghostline hat keine eigene Endpunktliste: Endpunkte, API-Schlüssel und Modellliste kommen vom Manager, und der Manager hält die Schlüssel im Obsidian-Schlüsselbund.
- **Ein lokaler LLM-Server** mit geladenem Modell, zum Beispiel LM Studio. Neu bei lokalen LLMs? Die **[Anleitung zum lokalen LLM](https://uplink.jkaindl.de/llm-setup)** führt dich durch Server und Modell.

## Install

### Community plugins

Ghostline ist noch nicht im Community Store. Nach der Aufnahme: **Einstellungen → Community-Plugins → Durchsuchen → „Ghostline“**.

### Manual

Lade `main.js`, `manifest.json` und `styles.css` vom [neuesten Release](https://github.com/johannes-kaindl/ghostline/releases) nach `<Vault>/.obsidian/plugins/ghostline/` (nimm deinen Konfigurationsordner, falls er nicht `.obsidian` heißt) und aktiviere **Ghostline** unter **Einstellungen → Community-Plugins**.

### BRAT (beta)

Installiere das Plugin BRAT, wähle **Add beta plugin** und trage das Repository `johannes-kaindl/ghostline` ein.

### From source

```bash
git clone https://github.com/johannes-kaindl/ghostline
cd ghostline
npm install
npm run build   # erzeugt main.js
```

## Quick start

1. Installiere und aktiviere das Plugin **LLM Endpoint Manager**.
2. Trage im Manager deinen LM-Studio-Server als Endpunkt ein (und, falls er einen braucht, seinen Schlüssel).
3. Öffne **Einstellungen → Ghostline** und wähle unter **Endpoint** Endpunkt und Modell. „Automatisch“ lässt den Server das nehmen, was er geladen hat.
4. Öffne eine Notiz und schreibe. Nach einer kurzen Pause (standardmäßig 300 ms) erscheint hinter dem Cursor ein grauer Vorschlag, wenn der Cursor am Zeilenende steht und auf ein Leerzeichen oder ein Satzzeichen folgt.
5. Drücke **Tab**, um ihn zu übernehmen.

## Usage

<img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/list-suggestion.png" width="820" alt="Ein Ghost-Text-Vorschlag, der den letzten Listenpunkt vervollständigt">

<img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/next-word.png" width="820" alt="Ein Wort mit Pfeil rechts übernehmen: der Rest des Vorschlags bleibt als graue Schrift stehen">

- **Tab** übernimmt den ganzen Vorschlag; in den Einstellungen lässt es sich auf „nächstes Wort“ ändern oder abschalten. Ohne sichtbaren Vorschlag tut Tab, was es immer tut (zum Beispiel eine Liste einrücken).
- **Pfeil rechts** übernimmt das nächste Wort, solange ein Vorschlag sichtbar ist.
- **Escape** verwirft den Vorschlag. Bei eingeschaltetem Vim-Modus bleibt Escape bei Vim.
- **Wann Vorschläge erscheinen:** nur am Ende der aktuellen Zeile, nach einem Leerzeichen oder einem Satzzeichen, also nie mitten in einem Wort. Nicht in einer leeren Zeile, nicht in einem leeren Listenpunkt, nicht bei markiertem Text oder mehreren Cursorn und nicht in Frontmatter, Codeblöcken, Inline-Code, Formeln oder Tabellen. Der Befehl „Suggest now“ ist die manuelle Ausnahme: Er fragt auch in einer leeren Zeile, wenn hinter dem Cursor noch Text steht, und während der Pause nach einem Fehler (weiterhin nicht mitten in einem Wort).
- **Befehle** (Hotkeys unter Einstellungen → Hotkeys vergeben, standardmäßig ist keiner gesetzt): Accept suggestion, Accept next word, Dismiss suggestion, Suggest now, Turn suggestions on or off. Lies den [Hinweis zu Hotkeys](https://github.com/johannes-kaindl/ghostline/blob/main/docs/explanation/privacy.md#hotkeys-on-the-accept-commands), bevor du die Übernehmen-Befehle belegst.
- **Statusleiste:** zeigt „Ghostline: an“ oder „aus“, die Zeit bis zum ersten Wort des letzten Vorschlags und Fehler (Endpunkt nicht erreichbar, Zeitüberschreitung, Modell, das immer denkt). Ein Klick schaltet Ghostline ein oder aus; verlangt der Status eine Aktion von dir (zum Beispiel „Kein Endpunkt gewählt“), öffnet der Klick stattdessen die Einstellungen.
- **Anfrageweg:** „Automatisch“ nutzt Fill-in-the-Middle (FIM) für Modelle, deren Familie eine bekannte Vorlage hat (derzeit Qwen2.5-Coder), und Chat für alles andere.
- **Notizen ausschließen:** per Muster in den Einstellungen oder mit `ghostline: false` in den Eigenschaften einer Notiz, siehe [Notizen ausschließen](https://github.com/johannes-kaindl/ghostline/blob/main/docs/how-to/exclude-notes.md).

## Configuration

<a href="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/settings.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/thumbs/settings.png" width="380" alt="Der Einstellungen-Tab von Ghostline mit den Gruppen Help, Endpoint, Behavior und Exclusions"></a><br><sub>Vorschau anklicken für das Bild in voller Größe</sub>

**Einstellungen → Community-Plugins → Ghostline**, mit den Standardwerten:

| Einstellung | Standard | Was sie tut |
|---|---|---|
| Endpunkt und Modell | keiner gewählt | Kommt vom LLM Endpoint Manager. „Automatisch“ lässt den Server das nehmen, was er geladen hat. |
| Suggestions | an | Schaltet Ghostline ein oder aus. |
| Tab key | ganzen Vorschlag übernehmen | Ganzer Vorschlag, nächstes Wort oder nicht belegt. |
| Request path | Automatisch | Automatisch, Chat oder FIM. |
| Pause before a suggestion | 300 ms | 150 bis 1000 ms. |
| Context before the cursor | 1500 Zeichen | 300 bis 4000 Zeichen. |
| Excluded notes | leer | Ein Muster pro Zeile. |
| Request | aus der Kit-Tabelle, Modus „complete“ | Sampling-Werte und Denken, in den Einstellungen sichtbar. |

Die vollständige Liste mit festen Werten und Fehlerbehandlung steht in der [Einstellungs-Referenz](https://github.com/johannes-kaindl/ghostline/blob/main/docs/README.md#reference).

## How it works

1. Nach jeder Änderung wartet Ghostline, bis die Pause abgelaufen ist; jeder weitere Tastendruck startet sie neu.
2. Es schneidet den Kontext zu: den Text vor dem Cursor (bis zur gewählten Länge) und bis zu 200 Zeichen dahinter, ohne Frontmatter und Abfrageblöcke.
3. Private Schlüssel, E-Mail-Adressen und gängige Token-Formate in diesem Text werden durch eine Markierung ersetzt.
4. Es sendet eine Anfrage, als Chat oder als FIM, an den gewählten Endpunkt und das gewählte Modell. Die Antwort ist auf 40 Tokens begrenzt und endet am ersten Zeilenumbruch; nach 20 Sekunden wird die Anfrage aufgegeben.
5. Die Antwort erscheint als Ghost-Text hinter dem Cursor. Tab, Pfeil rechts oder Escape beenden ihn; tippst du den vorgeschlagenen Text selbst, bleibt der Rest stehen, alles andere verwirft ihn.

Was jede Anfrage enthält und wo der Schutz endet: [What goes to the model](https://github.com/johannes-kaindl/ghostline/blob/main/docs/explanation/privacy.md) (englisch).

## Documentation

Der [Doku-Index](https://github.com/johannes-kaindl/ghostline/blob/main/docs/README.md) (englisch) listet die Anleitungen, die Erklärung zum Datenschutz, die Einstellungs-Referenz und die Fehlerbehebung.

## License

Code: AGPL-3.0-or-later, siehe [LICENSE](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE). Dokumentation: CC BY-SA 4.0, siehe [LICENSE-DOCS](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE-DOCS). Doppellizenz und Beiträge: [LICENSING.md](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSING.md), [CLA.md](https://github.com/johannes-kaindl/ghostline/blob/main/CLA.md).

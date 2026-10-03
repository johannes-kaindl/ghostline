# GUI-Smoke Ghostline

Der Treiber `scripts/gui-smoke.ts` fährt die Prüfpunkte G1 bis G15 gegen eine Obsidian-Zweitinstanz (eigenes Profil, eigener Port 9363, CDP-Lock für diesen Port). Das Rezept steht im Kopf der Datei. Ein Fake-LLM-Server und ein Fake-Manager leben im Treiber, es fließt kein echter Schlüssel und keine echte URL.

Erwartete Bilanz: `Smoke 15 gruen · 0 rot · 0 uebersprungen · 0 nichts gemessen`. DOM-Prüfungen sind kein Layout-Beweis: wie die Statusleiste aussieht, zeigt kein Punkt.

| Punkt | Was | Erwartung |
|---|---|---|
| G1 | Vorschlag erscheint (`Schreiben.md`, Leerzeichen am Zeilenende) | `.ghostline-ghost` binnen 2000 ms |
| G2 | Tab übernimmt | Zeile endet auf `in den Park`, kein Ghost mehr |
| G3 | Pfeil rechts nimmt ein Wort | Zeile endet auf `in`, Ghost ` den Park` |
| G4 | Escape verwirft | Ghost weg, Zeile unverändert |
| G5 | Durchtippen | Tippen von `in` lässt ` den Park` stehen, Fake-Zähler unverändert |
| G6 | Tippen bricht ab | Fake meldet binnen 1000 ms eine vorzeitig geschlossene Verbindung |
| G7 | Tab ohne Vorschlag rückt ein (`Liste.md`) | Zeile 2 beginnt mit Tab oder Leerzeichen, keine Anfrage |
| G8 | Keine Vorschläge in Codeblock, Frontmatter, `Clippings/`, `ghostline: false` | Ghost null und Fake-Zähler steigt nicht, ein Zeichen wurde wirklich getippt |
| G9 | Vim: Ghost nur im Insert-Modus | Ghost im Insert, nach Escape weg und `.cm-fat-cursor` da; läuft zuletzt |
| G10 | Eigenes Hotkey `Mod+Shift+L` auf `ghostline:accept` ohne Vorschlag (Spec § 6.5) | Messung: Text unverändert, keine Notice; ob der Editor die Taste bekam, steht im Detail |
| G11 | Statusleiste | `aria-pressed` und `is-ok`; Klick: `is-off`, Label `Ghostline: off/aus`; Klick: wieder an |
| G12 | Nicht erreichbar | `is-error` binnen 3000 ms; nach Neustart des Fake und „Vorschlag jetzt holen“ `is-ok` und Ghost binnen 2000 ms |
| G13 | Anfrageweg automatisch | `qwen2.5-coder-smoke` sendet an `/v1/completions`, `smoke-chat` an `/v1/chat/completions` |
| G14 | Modellwahl schlägt Default | Body trägt `qwen2.5-coder-smoke`, nicht `smoke-chat` |
| G15 | Schlüssel wird vor dem Fensterschnitt geschwärzt (`Schluessel.md`, `contextChars` 300) | Keine Zeile des Schlüsselkörpers im Anfrage-Body, `[redacted-private-key]` vorhanden |

## Verhalten des Treibers

Der Port ist Pflicht (`--port <n>`), es gibt keinen Default im Code. Jede Prüfgruppe läuft in einem eigenen try/catch: wirft sie, werden ihre fehlenden Punkte als „nichts gemessen“ mit dem Fehlertext geführt, der Lauf geht weiter, und die Bilanz mit Nenner 15 wird in jedem Fall gedruckt; der Exit-Code ist ungleich 0, sobald ein Punkt nicht grün ist. Vor dem Lauf werden Einstellungen-Fenster und zusätzliche Leaves geschlossen. Ein Build im Vault mit ungeklärter Herkunft bricht den Lauf ab (alles „nichts gemessen“). G8 trägt je Fall eine Positivkontrolle (Schreiben.md, An.md ohne Flag, Clippings/Fremd.md mit leerem Ausschluss), die im Detailtext steht. G15 prüft numerisch, dass die Fenstergrenze im Schlüssel liegt, sonst „nichts gemessen“.

## Gegenprobe G15

Der Treiber prüft vor jedem Lauf mit einem synthetischen undichten Body, dass die Auswertung rot werden kann (Selbsttest). Zusätzlich wurde 2026-10-03 mit einem Scratch-Build die alte Reihenfolge nachgestellt (Fenster zuerst schneiden, dann nur die Paarregel schwärzen, ohne die Regeln für verwaiste Hälften): G15 wurde rot (2 von 28 Körperzeilen durchgelassen, Marke fehlt), alle anderen Punkte blieben grün. Der Scratch-Stand wurde danach vollständig zurückgesetzt.

## Messbefunde beim Bau

- Eine Cursorbewegung ans Zeilenende löst im Plugin selbst einen Vorschlag aus (`other-change` startet den Timer neu). Der Treiber wartet diese Anfrage beim Öffnen einer Notiz ab und verwirft den Ghost.
- Ist `Mod+Shift+L` auf `ghostline:accept` gelegt, verschluckt Obsidian die Taste auch ohne sichtbaren Vorschlag (Editor sieht kein keydown). Ohne eigenes Hotkey kommt sie durch.

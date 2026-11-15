# Capture contract — README images

This folder holds the images that `README.md` and `README.de.md` embed. This file is the contract for them: which images exist, what each must show, and how to record them again.

`readme_lint.py` (workspace tool) compares contract, files and README embeds in all directions.

## Status

All four images are recorded against a real model: LM Studio on `localhost:1234`, model `qwen2.5-coder-7b`, reached through the real LLM Endpoint Manager plugin (no fake server, no fake manager). The ghost text in the images is the model's own answer to a typed space, not text set by the driver.

## Classes

| Class | Embedding | Limit |
|---|---|---|
| `hero` | `width="820"`, centered, right after the badges | landscape (H ≤ W) |
| `feature` | `width="820"` | H/W ≤ 1.6 |
| `detail` | preview `width="380"`, linked to the full image | no height limit |

## Images

| File | Class | Referenced by | Must show |
|---|---|---|---|
| `hero-demo.webp` | hero-video | `README.md`, `README.de.md` (top) | The README clip from clipwerk (`projects/ghostline-hero`, v2): the words `evening we` typed key by key into the note **Weekend in Lisbon**, a 1.2 s wait, the model's own suggestion as grey text, `Tab`, a held frame. 8 s, 1280 px wide, animated WebP (loop). The recording is `lisbon-tippen` (below); the wait is shortened and the README says so. |
| `hero.png` | feature | `README.md`, `README.de.md` (Usage, first image) | The note **Weekend in Lisbon** in the editor with the cursor at the end of the last line and a grey ghost-text suggestion continuing the sentence. Status bar visible with the Ghostline entry. Left sidebar collapsed. |
| `list-suggestion.png` | feature | `README.md`, `README.de.md` (Usage) | The note **Team sync**: a ghost-text suggestion that completes the last bullet of a list. Same window width as the hero (default height, 420 px), so the suggestion works in a different block kind. |
| `next-word.png` | feature | `README.md`, `README.de.md` (Usage) | The note **Project ideas** after one press of the right arrow: the first word of the suggestion is now normal text, the rest stays as grey ghost text. Shows word-by-word acceptance. |
| `settings.png` | detail | `README.md`, `README.de.md` (Configuration) | The Ghostline settings tab from Help down to Exclusions at their defaults, with the Status bar switch in the Behavior group. The image ends above the Request group on purpose: its rows depend on the endpoint state (model family and backend unknown for a bare endpoint) and say nothing about the delivered defaults. |

## Recipe

Record in a second Obsidian instance with its own profile and port, never in the regular instance. The surface language must be English (`obsidian.json` and `localStorage["language"]`).

```bash
UD=/tmp/obs-test-ghostline-shots; mkdir -p "$UD"
npm run build && npm run shots -- --setup          # builds the vault from docs/images/fixture
cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
# register the vault in $UD/obsidian.json, start the instance with --remote-debugging-port=<port>,
# confirm the trust dialog once, then:
npm run shots -- --port <port>                     # all images
npm run shots -- --port <port> --only hero.png     # one image
npm run shots -- --list                            # show the contract
```

The recipe copies the built `llm-endpoint-manager` plugin from the neighbouring repo into the recording vault and writes one endpoint (`LM Studio`, `http://localhost:1234`) into its settings. Without a reachable model the recording stops with a message instead of drawing a mock.

`hero.png` and `next-word.png` are recorded in a shorter window than the rest (300 and 270 px high instead of 420, `HOEHE_HERO` and `HOEHE_NEXT_WORD` in `scripts/shots.ts`): their text ends early, and in the default window a large empty area stayed between the text and the status bar (37 % and 43 % identical rows; the check allows 25 %). The status bar stays in the picture.

After the recording, look at every image: crop, legibility, nothing private, and that the suggestion is the model's own text.

## Sequences

A sequence is one operation recorded in a single start: inputs at a fixed pace, one frame per keystroke, plus the input log in the contract with media-kit (`tools/obsidian-cdp/README.md` § Sequenz). The recipe is `scripts/sequenz.ts` (`npm run sequenz`); the frames are raw material for a composition (clipwerk) and are not embedded in the README. The output (`out/sequenz/`) is not tracked.

Same state as the stills: the vault from `npm run shots -- --setup` (default Obsidian theme, real `llm-endpoint-manager`, LM Studio with `qwen2.5-coder-7b`), window 1200 × 360 px, editor font 20 px, English surface. Without a reachable model the recording stops; it does not draw a mock.

| Sequence | Inputs | Result | What it must show |
|---|---|---|---|
| `lisbon-tippen` | `evening` · `Space` · `we` · `Space` · `VORSCHLAG` (wait for the model, a log step with the target `ghost`) · `Tab` | `out/sequenz/lisbon-tippen/` (one frame per keystroke, 6 log lines) | The note **Weekend in Lisbon**, last line cut back to `… In the` by the driver before the start (state preparation, not part of the input log): the words `evening we` are typed key by key, then the editor waits, then the model's own suggestion appears as grey text, then `Tab` makes it normal text. `sequenz.json` → `herkunft` carries the suggestion and the measured wait (`wartezeit_ms`); the wait is real latency, so a clip that shortens it says so. |

```bash
npm run sequenz -- --port <port>                    # needs the second instance, see Recipe
```

The working tree must be clean (the recorded commit has to describe the state); for measurement runs only: `--herkunft-unsauber`.

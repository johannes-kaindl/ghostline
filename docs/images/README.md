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
| `hero.png` | hero | `README.md`, `README.de.md` (top) | The note **Weekend in Lisbon** in the editor with the cursor at the end of the last line and a grey ghost-text suggestion continuing the sentence. Status bar visible with the Ghostline entry. Left sidebar collapsed. |
| `list-suggestion.png` | feature | `README.md`, `README.de.md` (Usage) | The note **Team sync**: a ghost-text suggestion that completes the last bullet of a list. Same window as the hero, so the suggestion works in a different block kind. |
| `next-word.png` | feature | `README.md`, `README.de.md` (Usage) | The note **Project ideas** after one press of the right arrow: the first word of the suggestion is now normal text, the rest stays as grey ghost text. Shows word-by-word acceptance. |
| `settings.png` | detail | `README.md`, `README.de.md` (Configuration) | The Ghostline settings tab from Help down to Exclusions at their defaults. The image ends above the Request group on purpose: its rows depend on the endpoint state (model family and backend unknown for a bare endpoint) and say nothing about the delivered defaults. |

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

After the recording, look at every image: crop, legibility, nothing private, and that the suggestion is the model's own text.

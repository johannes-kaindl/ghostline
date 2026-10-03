# Ghostline

> 🇬🇧 English · [🇩🇪 Deutsch](https://github.com/johannes-kaindl/ghostline/blob/main/README.de.md)

**Inline ghost-text completion for the current line, powered by a local LLM. Tab accepts.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/ghostline?label=release)](https://github.com/johannes-kaindl/ghostline/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.11.4%2B%20·%20desktop-7c3aed)

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/hero.png" width="820" alt="A note in the editor with a grey ghost-text suggestion continuing the last sentence"></p>

While you write, Ghostline waits for a short pause, asks a local model how the current line could continue and shows the answer as grey text behind the cursor. Tab takes it, Escape throws it away. Nothing leaves your machine unless you point it at a remote endpoint yourself.

## Features

- **Ghost text at the cursor.** A grey suggestion for the rest of the current line, shown after a short pause; Tab accepts it whole (or word by word), Escape dismisses it.
- **Local first.** The text goes only to the endpoint and model you chose, normally a server on your own machine. Obvious secrets (private keys, e-mail addresses, tokens) are replaced by a marker before anything is sent.
- **Chat or fill-in-the-middle.** "Automatic" uses fill-in-the-middle (FIM) for model families with a known template and chat for everything else.
- **Excludable.** Keep folders, files or single notes away from the model with patterns or with `ghostline: false` in a note's properties.
- **Endpoints from one place.** Endpoints, keys and the model list come from the LLM Endpoint Manager; Ghostline keeps no list or key of its own.

## Requirements

- **Obsidian 1.11.4+, desktop only.** The endpoint keys live in Obsidian's keychain, which needs `app.secretStorage` from that version on.
- **The LLM Endpoint Manager plugin.** Ghostline has no endpoint list of its own: endpoints, API keys and the model list come from the manager, and keys are kept in the Obsidian keychain by the manager.
- **A local LLM server** with a model loaded, for example LM Studio. New to local LLMs? The **[local LLM setup guide](https://uplink.jkaindl.de/llm-setup)** walks you through server and model.

## Install

### Community plugins

Ghostline is not in the Community Store yet. After the Store listing: **Settings → Community plugins → Browse → "Ghostline"**.

### Manual

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/johannes-kaindl/ghostline/releases) into `<vault>/.obsidian/plugins/ghostline/` (use your configuration folder if it is not `.obsidian`), then enable **Ghostline** under **Settings → Community plugins**.

### BRAT (beta)

Install the BRAT plugin, choose **Add beta plugin** and enter the repository `johannes-kaindl/ghostline`.

### From source

```bash
git clone https://github.com/johannes-kaindl/ghostline
cd ghostline
npm install
npm run build   # produces main.js
```

## Quick start

1. Install and enable the **LLM Endpoint Manager** plugin.
2. In the manager, add your LM Studio server as an endpoint (and, if it needs one, its key).
3. Open **Settings → Ghostline** and choose the endpoint and the model under **Endpoint**. "Automatic" lets the server use whatever it has loaded.
4. Open a note and write. After a short pause (300 ms by default) a grey suggestion appears behind the cursor, when the cursor is at the end of the line and follows a space or a punctuation mark.
5. Press **Tab** to accept it.

## Usage

<img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/list-suggestion.png" width="820" alt="A ghost-text suggestion completing the last item of a bullet list">

<img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/next-word.png" width="820" alt="Accepting one word with the right arrow: the rest of the suggestion stays as grey text">

- **Tab** accepts the whole suggestion; in the settings you can change it to "next word" or unbind it. Without a visible suggestion Tab does what it always does (indent a list, for example).
- **Right arrow** accepts the next word while a suggestion is visible.
- **Escape** dismisses the suggestion. With Vim mode on, Escape is left to Vim.
- **When suggestions appear:** only at the end of the current line, after a space or a punctuation mark, so never in the middle of a word. Not on an empty line, not in an empty list item, not with text selected or several cursors, and not inside frontmatter, code blocks, inline code, math or tables. The command "Suggest now" is the manual override: it also asks on an empty line, when text follows the cursor on the line, and during the pause after an error (still not in the middle of a word).
- **Commands** (assign hotkeys under Settings → Hotkeys, none are set by default): Accept suggestion, Accept next word, Dismiss suggestion, Suggest now, Turn suggestions on or off. Read the [note on hotkeys](https://github.com/johannes-kaindl/ghostline/blob/main/docs/explanation/privacy.md#hotkeys-on-the-accept-commands) before binding the accept commands.
- **Status bar:** shows "Ghostline: on" or "off", the time to the first word of the last suggestion, and errors (endpoint not reachable, timeout, model that always thinks). A click switches Ghostline on or off; when the status asks for your action (for example "No endpoint selected"), the click opens the settings instead.
- **Request path:** "Automatic" uses fill-in-the-middle (FIM) for models whose family has a known template (currently Qwen2.5-Coder) and chat for everything else.
- **Excluding notes:** by pattern in the settings or with `ghostline: false` in a note's properties, see [Exclude notes](https://github.com/johannes-kaindl/ghostline/blob/main/docs/how-to/exclude-notes.md).

## Configuration

<a href="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/settings.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/ghostline/main/docs/images/thumbs/settings.png" width="380" alt="The Ghostline settings tab with the Help, Endpoint, Behavior and Exclusions groups"></a><br><sub>Click the preview for the full-size image</sub>

**Settings → Community plugins → Ghostline**, with the defaults:

| Setting | Default | What it does |
|---|---|---|
| Endpoint and model | none chosen | Taken from the LLM Endpoint Manager. "Automatic" lets the server use what it has loaded. |
| Suggestions | on | Switches Ghostline on or off. |
| Tab key | Accept whole suggestion | Whole suggestion, next word, or not bound. |
| Request path | Automatic | Automatic, chat or FIM. |
| Pause before a suggestion | 300 ms | 150 to 1000 ms. |
| Context before the cursor | 1500 characters | 300 to 4000 characters. |
| Excluded notes | empty | One pattern per line. |
| Request | from the kit table, mode "complete" | Sampling values and thinking, shown in the settings. |

The full list with fixed values and error handling is in the [settings reference](https://github.com/johannes-kaindl/ghostline/blob/main/docs/README.md#reference).

## How it works

1. After each edit Ghostline waits for the pause to run out; any further keystroke starts it again.
2. It cuts the context: the text before the cursor (up to the chosen length) and up to 200 characters after it, without frontmatter and query blocks.
3. Private keys, e-mail addresses and common token formats in that text are replaced by a marker.
4. It sends one request, as chat or as FIM, to the endpoint and model you chose. The answer is limited to 40 tokens and ends at the first line break; a request is given up after 20 seconds.
5. The answer is shown as ghost text behind the cursor. Tab, Right arrow or Escape end it; typing the suggested text keeps it, anything else drops it.

What each request contains and where the protection ends: [What goes to the model](https://github.com/johannes-kaindl/ghostline/blob/main/docs/explanation/privacy.md).

## Documentation

The [documentation index](https://github.com/johannes-kaindl/ghostline/blob/main/docs/README.md) lists the how-tos, the privacy explanation, the settings reference and troubleshooting.

## License

Code: AGPL-3.0-or-later, see [LICENSE](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE). Documentation: CC BY-SA 4.0, see [LICENSE-DOCS](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE-DOCS). Dual-licensing and contributions: [LICENSING.md](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSING.md), [CLA.md](https://github.com/johannes-kaindl/ghostline/blob/main/CLA.md).

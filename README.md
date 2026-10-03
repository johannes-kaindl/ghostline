# Ghostline

**Inline ghost-text completion for the current line, powered by a local LLM. Tab accepts.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/ghostline/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/ghostline?label=release)](https://github.com/johannes-kaindl/ghostline/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.11.4%2B%20·%20desktop-7c3aed)

While you write, Ghostline waits for a short pause, asks a local model how the current line could continue and shows the answer as grey text behind the cursor. Tab takes it, Escape throws it away. Nothing leaves your machine unless you point it at a remote endpoint yourself.

## Requirements

- **Obsidian 1.11.4+, desktop only.** The endpoint keys live in Obsidian's keychain, which needs `app.secretStorage` from that version on.
- **The LLM Endpoint Manager plugin.** Ghostline has no endpoint list of its own: endpoints, API keys and the model list come from the manager, and keys are kept in the Obsidian keychain by the manager.
- **A local LLM server** with a model loaded, for example LM Studio. New to local LLMs? The **[local LLM setup guide](https://uplink.jkaindl.de/llm-setup)** walks you through server and model.

## Quick start

1. Install and enable the **LLM Endpoint Manager** plugin.
2. In the manager, add your LM Studio server as an endpoint (and, if it needs one, its key).
3. Open **Settings → Ghostline** and choose the endpoint and the model under **Endpoint**. "Automatic" lets the server use whatever it has loaded.
4. Open a note and write. After a short pause (300 ms by default) a grey suggestion appears behind the cursor, when the cursor is at the end of the line and follows a space or a punctuation mark.
5. Press **Tab** to accept it.

## Usage

- **Tab** accepts the whole suggestion; in the settings you can change it to "next word" or unbind it. Without a visible suggestion Tab does what it always does (indent a list, for example).
- **Right arrow** accepts the next word while a suggestion is visible.
- **Escape** dismisses the suggestion. With Vim mode on, Escape is left to Vim.
- **When suggestions appear:** only at the end of the current line, after a space or a punctuation mark, so never in the middle of a word. Not on an empty line, not in an empty list item, not with text selected or several cursors, and not inside frontmatter, code blocks, inline code, math or tables. The command "Suggest now" is the manual override: it also asks on an empty line, when text follows the cursor on the line, and during the pause after an error (still not in the middle of a word).
- **Commands** (assign hotkeys under Settings → Hotkeys, none are set by default): Accept suggestion, Accept next word, Dismiss suggestion, Suggest now, Turn suggestions on or off. Read the [note on hotkeys](docs/explanation/privacy.md#hotkeys-on-the-accept-commands) before binding the accept commands.
- **Status bar:** shows "Ghostline: on" or "off", the time to the first word of the last suggestion, and errors (endpoint not reachable, timeout, model that always thinks). A click switches Ghostline on or off; when the status asks for your action (for example "No endpoint selected"), the click opens the settings instead.
- **Request path:** "Automatic" uses fill-in-the-middle (FIM) for models whose family has a known template (currently Qwen2.5-Coder) and chat for everything else.
- **Excluding notes:** by pattern in the settings or with `ghostline: false` in a note's properties, see [Exclude notes](docs/how-to/exclude-notes.md).

## Documentation

The [documentation index](docs/README.md) lists the how-tos, the privacy explanation and the settings reference.

## License

Code: AGPL-3.0-or-later, see [LICENSE](LICENSE). Documentation: CC BY-SA 4.0, see [LICENSE-DOCS](LICENSE-DOCS).

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Changed

- The README now shows screenshots of ghost-text suggestions (continuing a sentence, a list item, the next word) and of the settings.
- The troubleshooting guide ends with a “Getting help” section that links to the issue tracker.

## [0.1.0] — 2026-10-03

### Added

- Initial scaffold: manifest, build, vendored kit modules, settings model.
- Ghost-text suggestion for the current line, shown after a typing pause; Tab, Right arrow and Escape accept, accept a word and dismiss.
- Two request paths: chat and fill-in-the-middle (FIM, Qwen2.5-Coder), chosen automatically per model or fixed in the settings.
- Endpoints, keys and model list from the LLM Endpoint Manager; sampling values from the kit table, mode "complete".
- Context window with redaction of private keys, e-mail addresses and tokens before the cut; frontmatter and query blocks are never sent.
- Exclusion of notes by .gitignore-style patterns and by `ghostline: false` in the properties.
- Commands for accept, accept word, dismiss, suggest now and on/off; status bar item with state, last latency and errors.
- Settings tab with help row, German and English interface.
- Requires Obsidian 1.11.4 or newer: the endpoint keys are read from the Obsidian keychain (`app.secretStorage`).
- `npm run smoke:gui` (GUI smoke against a running Obsidian) and `npm run latency` (latency measurement, only after agreement).

### Fixed

- While a suggestion streams in, a repeated start of the sentence is no longer shown, and Tab never inserts text that the suggestion no longer shows.
- The "Last request" line in the Request section now shows the parameters of the last request (sampling values and stop list, never note text).
- Only the pane with the cursor asks for suggestions; a second pane on the same note stays quiet.
- The command "Turn Ghostline on or off" is now "Turn suggestions on or off" (Obsidian already shows the plugin name in front).

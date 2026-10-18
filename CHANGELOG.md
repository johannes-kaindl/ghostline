# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Documentation

- The README describes the Community Store install, and the LLM setup guide link points to its new address.

## [0.3.0] — 2026-10-16

### Fixed
- **Gemma 4 on LM Studio: a suggestion is never a sentence from the model's thinking.** Gemma 4 writes its thinking into the answer text without an opening marker and closes it with `<channel|>`. The suggestion now shows only what stands behind the marker, on the chat path and on the FIM path (`/v1/completions`); on the chat path the ghost text is cleared when the marker arrives. On the FIM path, while the text streams, the thinking can show for a moment before the marker replaces it. A Gemma 4 model that cannot be switched off on LM Studio no longer raises the "thinking despite off" warning.

### Changed
- Vendored `obsidian-kit` 0.61.0 and `code-kit` 0.28.0 (from 0.60.1 and 0.27.1). Visible effects of the skipped releases (obsidian-kit 0.60.2, 0.60.3, 0.61.0; code-kit 0.27.2, 0.28.0): with Gemma 4 on LM Studio, "thinking off" sends the lowest effort instead of `none` (LM Studio ignores `none` for that model), so the model thinks a little and the status line says it always thinks; a backend or model family the plugin does not know yet no longer raises an error in the request view; if the LLM Endpoint Manager is switched on after this plugin, the endpoint subscription now catches up instead of staying silent for the session.
- Vendored `obsidian-kit` 0.60.1 (was 0.59.1) and `code-kit` 0.27.1 (was 0.24.0). Nothing you see in this plugin changes: kit 0.60.0 adds the tool-provider contract, share export, per-code manager error texts and a thinking-button style that this plugin does not use; code-kit 0.25.0 to 0.27.0 add helpers (data URLs, byte sizes, local time stamps, slugs, single secret values) it does not use either.

## [0.2.3] — 2026-10-12

### Changed
- Vendored `obsidian-kit` 0.59.1 (was 0.56.0) and `code-kit` 0.24.0 (was 0.23.0).
- Settings, "Request" section: for an endpoint whose model family is not known yet it now reads "not detected yet" instead of "unknown", with a hint that this is normal for a freshly added endpoint and that the LLM Endpoint Manager keeps family and backend per model; the sampling fields read "not sent yet — waits for the model family". Nothing changes in what is sent.
- Nothing else is visible: the kit releases 0.56.1, 0.56.2, 0.57.0 and 0.58.0 and code-kit 0.24.0 add build and test helpers, an embedding-row option and a shortcut-failure helper that this plugin does not use in a visible way.

### Fixed
- The 2-MB-document test no longer relies on a wall-clock limit; it now checks that the time grows linearly with the document (a slow machine no longer fails it).

## [0.2.2] — 2026-10-12

### Changed

- Kit 0.56.0 / code-kit 0.23.0 in one step (from 0.53.0 / 0.21.0). The check of every model answer (`checkResponse`) removes a `<think>` block in linear time: an answer with 50 000 unclosed `<think>` took seconds before and takes under a millisecond now. Nothing else changes on screen: the endpoint comes from the LLM Endpoint Manager, so the new context-length line and the "— (server picks)" option of the kit's endpoint list (only drawn for a local list) do not appear in this plugin's settings.

## [0.2.1] — 2026-10-11

### Changed

- Kit 0.53.0 / code-kit 0.21.0. The masking of secrets before a request catches more `Bearer` tokens (eight characters or more, any case, `=` allowed in the token); prose such as "Bearer authentication" near the cursor is sent as `Bearer [redacted-token]`.

## [0.2.0] — 2026-10-09

### Changed

- The chat request now runs on the shared obsidian-kit connection: endpoint resolution, request parameters, the check of every answer and the **Request** section come from one place. The Settings tab shows endpoint, model and **Request** (collapsed by default) in one block under **Endpoint**.
- The chat client now lives per endpoint instead of per request. After a network error in the stream it falls back to answers without streaming only if that fallback succeeds; a changed endpoint or a settings change starts a fresh client.
- A request that ends at the token limit is still reported as "token budget used up". Waiting times stay at 15 seconds for the first chunk and 15 seconds of silence.
- Deviations (for example an empty answer because thinking used the token budget) are reported once per kind and appear in the status bar and in the **Request** section, also for the fill-in-the-middle path.
- Secrets in the text before and after the cursor are masked with the shared rules before they are cut to the context window. A leftover half of a private key between two unpaired `END` lines is now masked as well.
- The Settings tab now styles the Request section and the endpoint controls as intended; the shared styles had never been copied into the plugin.

## [0.1.1] — 2026-10-03

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

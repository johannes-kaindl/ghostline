# What goes to the model

Ghostline sends text from the note you are writing to one LLM endpoint. This page lists exactly what, where to, what is kept on disk and where the protection ends.

## What each request contains

- The title of the note.
- The text before the cursor, at most "Context before the cursor" characters (default 1500, range 300 to 4000). The window starts at a paragraph boundary where possible, so the start of the prompt stays the same between two requests.
- Up to 200 characters after the cursor.
- A short fixed instruction that asks the model to continue the text at the cursor.

Not part of a request:

- The frontmatter. It is never sent: text before the cursor starts after it, and no request is made at all while the cursor is inside the frontmatter (the same holds in code blocks, math and tables).
- Query blocks: code blocks of type `dataview`, `dataviewjs` and `base` are removed from the text before and after the cursor.
- Other notes. There is no related-notes feature in this version.

Before the window is cut, the text (and the title) is scanned and these parts are replaced by a marker:

- PEM private key blocks (`-----BEGIN ... PRIVATE KEY-----` up to the matching `END`) become `[redacted-private-key]`. A lone `BEGIN` or `END` line without its partner, as it can appear at the edge of the text that is examined, is also replaced together with everything on its side of the edge.
- E-mail addresses become `[redacted-email]`.
- `Bearer` followed by 16 or more token characters becomes `Bearer [redacted-token]`.
- Tokens that begin with `sk`, `rk`, `pk`, `ghp`, `gho`, `github_pat`, `xoxb` or `xoxp`, then `-` or `_`, then at least 12 letters, digits, `_` or `-`, become `[redacted-token]`.
- AWS access key IDs (`AKIA` followed by 16 capital letters or digits) become `[redacted-token]`.

## Where it goes

Only to the endpoint and model you chose in the settings, which the LLM Endpoint Manager provides. With a local server the text stays on your machine. Ghostline contacts no other address.

## What is never stored

`data.json` of the plugin holds the settings (on or off, Tab behaviour, request path, pause, context length, exclusion patterns, the chosen endpoint ID and model name, the sampling choices). It never holds an endpoint URL, an API key or any text that a model produced. Unknown fields in the file are dropped when it is read. The keys themselves are managed by the LLM Endpoint Manager in the Obsidian keychain.

## Known limits

These are limits of the protection, not bugs that are about to be fixed. Read them before you write secrets into notes.

1. **A private key block larger than the context window.** Redaction runs before the window is cut, and it also removes a lone key half. But if the cursor sits inside a PEM block that is longer than the amount of text Ghostline examines, the `BEGIN` line is out of reach and the middle of the key is not recognisable as a key. That middle part goes out in clear text.
2. **The lookback is bounded.** Ghostline examines at most the larger of three times the context length and 16384 characters before the cursor, plus a margin of 512 characters; after the cursor it examines the 200 characters plus the same margin. A secret that begins further back than that is not seen as a whole.
3. **Only the listed patterns are detected.** Passwords, other token formats, IBANs, phone numbers, names and everything else are not recognised. Add notes that hold such data to the exclusion list.

## Hotkeys on the accept commands

The Tab key is only taken while a suggestion is visible. A hotkey you assign yourself to the command `ghostline:accept` (or the other accept commands) behaves differently: measured in the GUI smoke test (G10), Obsidian swallows such a key combination even when no suggestion is visible, so the key does nothing else in that moment. Do not bind the accept commands to keys you need for something else; the built-in Tab, Right arrow and Escape handling does not have this problem.

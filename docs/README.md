# Ghostline documentation

## Tutorial

- [Quick start](../README.md#quick-start): install the manager, choose an endpoint, write, press Tab.

## How-to

- [Exclude notes](how-to/exclude-notes.md): keep folders, files or single notes away from the model.

## Explanation

- [What goes to the model](explanation/privacy.md): what each request contains, where it goes, what is never stored, the known limits, and a note on hotkeys.

## Reference

Settings, with the groups as they appear in Settings → Ghostline and their defaults:

| Group | Setting | Default | Range or values |
|---|---|---|---|
| Endpoint | Endpoint and model | none chosen | taken from the LLM Endpoint Manager |
| Behavior | Suggestions | on | on or off |
| Behavior | Tab key | Accept whole suggestion | whole suggestion, next word, not bound |
| Behavior | Request path | Automatic | automatic, chat, FIM |
| Behavior | Pause before a suggestion | 300 ms | 150 to 1000 ms |
| Behavior | Context before the cursor | 1500 characters | 300 to 4000 characters |
| Exclusions | Excluded notes | empty | one pattern per line |
| Request | Sampling values and thinking | from the kit table, mode "complete" | see the section in the settings |

Fixed values: the text after the cursor is capped at 200 characters, a suggestion asks for at most 40 tokens and ends at the first line break, and a request is given up after 20 seconds.

Error handling: after an error (endpoint not reachable, timeout, context too long, token budget used up) Ghostline makes no automatic request for 10 seconds; "Suggest now" still works during the pause. After three empty answers in a row the status bar shows a warning ("Empty responses — is the model thinking?").

## Troubleshooting

Each entry starts with what you see, then the cause and what to do.

- **Nothing appears.** Suggestions only appear at the end of the current line, after a space or a punctuation mark, after the pause (300 ms by default), and not on an empty line, with a selection or several cursors, or inside frontmatter, code blocks, inline code, math or tables. Check that Suggestions is on (the status bar reads "Ghostline: on"). The command "Suggest now" asks on an empty line or when text follows the cursor.
- **The note never gets a suggestion.** It may be excluded: check the patterns under Settings → Ghostline → Exclusions and the property `ghostline: false` in the note, see [Exclude notes](how-to/exclude-notes.md).
- **Status bar: "No endpoint selected — click to open settings".** No endpoint is chosen. Install the LLM Endpoint Manager, add your server there, then choose endpoint and model under Settings → Ghostline → Endpoint.
- **Status bar: "Endpoint not reachable: …".** The server is not running or the address is wrong. Start the server and check the endpoint in the LLM Endpoint Manager. After an error Ghostline makes no automatic request for 10 seconds; "Suggest now" still works.
- **Status bar: "Request timed out".** The model did not answer within 20 seconds. Load a smaller or faster model, or one that does not think.
- **Status bar: "Empty responses — is the model thinking?" or "This model always thinks".** The model spends its answer on reasoning and returns no text. Choose a model without thinking, or check the thinking level in the Request section of the settings.
- **Status bar: "Context too long for the model — lower the context length in the settings".** Lower "Context before the cursor" in the settings.
- **A hotkey does nothing else any more.** A hotkey assigned to an accept command is swallowed even when no suggestion is visible, see [the note on hotkeys](explanation/privacy.md#hotkeys-on-the-accept-commands). Use Tab, Right arrow and Escape instead.

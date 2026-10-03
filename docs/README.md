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

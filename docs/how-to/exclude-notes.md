# Exclude notes

Ghostline never sends anything from an excluded note and shows no suggestions there.

## By pattern

Open **Settings → Ghostline → Exclusions → Excluded notes**. Write one pattern per line, in the style of a `.gitignore`.

- `Clippings/` excludes the whole folder `Clippings`.
- `80_Archiv/alt` excludes the path `80_Archiv/alt` and everything below it.
- `*.excalidraw.md` excludes every note whose name ends in `.excalidraw.md`, in any folder.
- To allow only one folder, exclude everything and then allow it again: write `*` on one line and `!Notes/**` on the next.
- To take a single note out of an excluded folder, add a negated line after the pattern: `80_Archiv/` followed by `!80_Archiv/keep.md`.

On each level of a path the last matching line wins, and the deepest level with a match decides. Lines that cannot be read are ignored, and the settings list them under the field ("Ignored lines").

## By property

Put `ghostline: false` into the properties (frontmatter) of a note:

```yaml
---
ghostline: false
---
```

That note is excluded whatever the patterns say.

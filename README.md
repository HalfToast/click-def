# Click Define

A Firefox extension that shows the definition of any word — in any language — when you double-click it.

## Features

- **Double-click** any word on any page to see its definition.
- **Multilingual** definitions via Wiktionary (hundreds of languages).
- **Language picker** in the popup when a word has entries in multiple languages.
- **Pronunciation** with IPA and an audio button (English).
- **Synonyms & antonyms** as clickable chips — click one to look it up; ← to go back.
- **Lemma fallback** — finds "running" → "run", "boxes" → "box", "happily" → "happy".
- **Settings page** for toggles and preferences.
- Light + dark mode, smart positioning, `Esc` to dismiss.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select [manifest.json](manifest.json).

## Install (permanent)

Build the zip and upload it to addons.mozilla.org:

```powershell
./build.ps1
```

This produces `click-define.zip`. Upload at:
<https://addons.mozilla.org/developers/addon/submit/distribution>

## Definition sources

| Source | Used for | Languages | Key required |
| --- | --- | --- | --- |
| Wiktionary REST API | Definitions, parts of speech, examples | Hundreds | No |
| Free Dictionary API | IPA, audio, contextual syn/ant | English only | No |
| Datamuse | Thesaurus (syn/ant) | English only | No |

## Files

- [manifest.json](manifest.json) — MV3 manifest (Firefox-compatible)
- [content.js](content.js) — double-click handler, fetching, popup rendering
- [content.css](content.css) — popup styles
- [options.html](options.html), [options.css](options.css), [options.js](options.js) — settings page
- [icon.svg](icon.svg) — toolbar icon
- [LICENSE](LICENSE) — MIT
- [PRIVACY.md](PRIVACY.md) — privacy disclosure (required for AMO)
- [build.ps1](build.ps1) — produces submission zip

## Submitting to addons.mozilla.org

Mozilla requires:

1. **Source code** — this extension is unminified vanilla JS, so the uploaded zip *is* the source. No separate source upload needed.
2. **Privacy policy** — see [PRIVACY.md](PRIVACY.md). Paste its contents into the AMO listing's privacy field.
3. **Permissions justification** — when prompted on AMO:
   - `storage` — used to persist user settings.
   - `host_permissions` for `wiktionary.org`, `dictionaryapi.dev`, `datamuse.com` — required to fetch definitions; only the selected word is sent, never page content.
4. **Listing assets** — supply 1–10 screenshots and a tagline. Upload these on the AMO web form, not in the zip.
5. **Extension ID** — set in `browser_specific_settings.gecko.id` (already configured as `click-define`; change to a domain-style ID you control before publishing if desired).

## License

MIT — see [LICENSE](LICENSE).

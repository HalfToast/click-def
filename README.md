# Click Define

A Firefox extension that shows the definition of any word, in any language, when you double-click it.

## Features

- **Double-click** any word on any page to see its definition.
- **Multilingual** definitions via Wiktionary (hundreds of languages).
- **Language picker** in the popup when a word has entries in multiple languages.
- **Pronunciation** with IPA and an audio button (English).
- **Synonyms & antonyms** as clickable chips; click one to look it up; ← to go back.
- **Lemma fallback** finds "running" → "run", "boxes" → "box", "happily" → "happy".
- **Settings page** for toggles and preferences.
- Light + dark mode, smart positioning, `Esc` to dismiss.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select [manifest.json](manifest.json).

## Definition sources

| Source | Used for | Languages | Key required |
| --- | --- | --- | --- |
| Wiktionary REST API | Definitions, parts of speech, examples | Hundreds | No |
| Free Dictionary API | IPA, audio, contextual syn/ant | English only | No |
| Datamuse | Thesaurus (syn/ant) | English only | No |

## Files

- [manifest.json](manifest.json) - MV3 manifest (Firefox-compatible)
- [content.js](content.js) - double-click handler, fetching, popup rendering
- [content.css](content.css) - popup styles
- [options.html](options.html), [options.css](options.css), [options.js](options.js) — settings page
- [icon.svg](icon.svg) - toolbar icon
- [LICENSE](LICENSE) - MIT
- [PRIVACY.md](PRIVACY.md) - privacy disclosure

## License

MIT - see [LICENSE](LICENSE).

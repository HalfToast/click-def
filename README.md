# Click Define

A Firefox extension that shows the definition of any word, in any language, when you double-click it. Works on desktop and Firefox for Android.

## Features

- **Double-click** any word on any page to see its definition (long-press on Android).
- **Multilingual** definitions via Wiktionary (hundreds of languages).
- **Language picker** in the popup when a word has entries in multiple languages. Defaults to the page's language automatically, or pick a persistent default in settings.
- **Pronunciation** with IPA and an audio button (English).
- **Synonyms & antonyms** as clickable chips; click one to look it up; ← to go back.
- **Inflected-form detection** shows a chip jumping you to the base word (`boxes` → `box`, `ran` → `run`, `happier` → `happy`, even `recieve` → `receive` for misspellings). Words with their own meanings ("glasses", "drunk", "data") are left alone. Optionally auto-jump to the lemma instead.
- **Lemma fallback** for inflected forms with no Wiktionary entry of their own ("happily" → "happy").
- **Sticky popup** that scrolls with the word it's defining.
- **Network resilience**: retries transient fetch failures once, and shows a clear retry button if it still fails.
- **Settings page** for toggles, preferences, and default language.
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
- [background.js](background.js) - performs network requests (bypasses page CSP)
- [content.js](content.js) - double-click handler, popup rendering, messaging
- [content.css](content.css) - popup styles
- [options.html](options.html), [options.css](options.css), [options.js](options.js) - settings page
- [icon.svg](icon.svg) - toolbar icon
- [LICENSE](LICENSE) - MIT
- [PRIVACY.md](PRIVACY.md) - privacy disclosure

## License

MIT - see [LICENSE](LICENSE).

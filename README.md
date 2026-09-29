# Click Define

A Firefox extension that shows the definition of any word, in any language, when you double-click it. Works on desktop and Firefox for Android.

## Features

- **Double-click** any word on any page to see its definition (long-press on Android).
- **Multilingual** definitions via Wiktionary (hundreds of languages).
- **Language picker** in the popup when a word has entries in multiple languages. Defaults to the page's language automatically, or pick a persistent default in settings.
- **Pronunciation** with IPA and an audio button, in every language Wiktionary covers. The transcription follows the language shown in the popup (`Katze` → `/ˈkatsə/`, `chien` → `/ʃjẽ/`), and switching language with the picker updates it instantly.
- **Synonyms & antonyms** as clickable chips; click one to look it up; ← to go back.
- **Inflected-form detection** shows a chip jumping you to the base word (`boxes` → `box`, `ran` → `run`, `happier` → `happy`, even `recieve` → `receive` for misspellings). Words with their own meanings ("glasses", "drunk", "data") are left alone. Optionally auto-jump to the lemma instead.
- **Lemma fallback** for inflected forms with no Wiktionary entry of their own ("happily" → "happy").
- **Sticky popup** that scrolls with the word it's defining.
- **Network resilience**: the definition renders as soon as Wiktionary answers instead of waiting on the slower extras, every request is capped by a timeout, transient failures retry once, and a clear retry button appears if a lookup really fails.
- **Settings page** for toggles, preferences, default language, and theme.
- **Light + dark mode**, following your system by default, or pinned to one in settings.
- Smart positioning, `Esc` to dismiss.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select [manifest.json](manifest.json).

## Definition sources

| Source | Used for | Languages | Key required |
| --- | --- | --- | --- |
| Wiktionary REST API | Definitions, parts of speech, examples | Hundreds | No |
| Wiktionary action API | IPA and pronunciation audio | Hundreds | No |
| Free Dictionary API | English IPA/audio fallback, contextual syn/ant | English only | No |
| Datamuse | Thesaurus (syn/ant) | English only | No |

Pronunciation costs a second Wiktionary request per word (the IPA lives in the page source, not in the definition response), cached per word so repeat lookups and language switches are free. Turn off **Pronunciation** in settings to skip it.

## Files

- [manifest.json](manifest.json) - MV3 manifest (Firefox-compatible)
- [background.js](background.js) - performs network requests (bypasses page CSP)
- [content.js](content.js) - double-click handler, popup rendering, messaging
- [content.css](content.css) - popup styles
- [options.html](options.html), [options.css](options.css), [options.js](options.js) - settings page
- [icon.svg](icon.svg) - toolbar icon
- [LICENSE](LICENSE) - MIT
- [PRIVACY.md](PRIVACY.md) - privacy disclosure
- [test/](test/) - unit tests

## Tests

No dependencies and no build step - the suite runs on Node's built-in test runner:

```
node --test test/*.test.mjs
```

- [test/harness.mjs](test/harness.mjs) - loads `content.js` alongside stand-ins for the browser globals it touches, and hands its internals to the tests
- [test/parsing.test.mjs](test/parsing.test.mjs) - case variants, lemma fallback, inflected-form detection
- [test/pronunciation.test.mjs](test/pronunciation.test.mjs) - wikitext template parsing, generated-IPA resolution, caching
- [test/rendering.test.mjs](test/rendering.test.mjs) - pronunciation source preference, chip filtering, progressive repaint
- [test/settings.test.mjs](test/settings.test.mjs) - settings/control parity, theme resolution

Nothing in the suite touches the network - every API response is stubbed - so it is fast and deterministic.

## License

MIT - see [LICENSE](LICENSE).

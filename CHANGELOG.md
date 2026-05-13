# Changelog

## 0.3.0

- Added Firefox for Android support. Long-press a word to select it and the popup appears automatically (the desktop double-click still works on devices with a mouse).
- Responsive popup sizing for small screens: full-width on phones, larger tap targets for buttons and chips.
- Outside-tap dismissal now works for touch as well as mouse.

## 0.2.3

- Try lowercase form first when looking up a word, since difficult/rare words are almost always lowercase. Fixes inconsistent results for sentence-initial words.

## 0.2.2

- Refactored DOM updates to use `DOMParser` instead of `innerHTML`, silencing Mozilla validator warnings.
- Bumped `strict_min_version` to 142.0 to support the `data_collection_permissions` manifest key.
- Declared `data_collection_permissions: { required: ["none"] }` to comply with Firefox's new data consent system.
- Updated extension ID to `click-define@halftoast.dev` (domain-style required by AMO).
- New icon: blue gradient tile with "Aa" wordmark and cursor mark.
- Added `export-icon.html` for generating PNG icons from the SVG source.

## 0.2.1

- Added clickable synonym and antonym chips, powered by Datamuse for richer thesaurus data.
- Added back button to return to the previous word after following a chip.
- Added lemma fallback so inflected forms ("running", "boxes", "happily") resolve to their base word.
- Added language picker in the popup header for words with entries in multiple languages.
- Added Unicode normalization and case-variant fallback for selected text.
- Added settings page with toggles for pronunciation, synonyms, antonyms, examples, auto-expand, modifier key, and audio auto-play.
- Pronunciation (IPA + audio button) and synonyms/antonyms now appear in the popup header.

## 0.1.0

- Initial release.
- Double-click any word to see its definition.
- Wiktionary REST API for multilingual definitions.
- Smart popup positioning above the selected text.
- "Show full definition" expand button.
- Light and dark mode.

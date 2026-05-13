# Changelog

## 0.4.1

- New **Default language** setting in the options page. Pick a specific language (~45 options) to always default to it, or leave on "Auto (use page language)" which falls back to the page's `<html lang>`, then English.
- Fix: the in-popup language picker was silently overwriting the persistent default on every change, so a one-off switch to another language stuck around forever and broke "Auto". The picker is now session-only — it changes the current lookup's display but doesn't update the saved default. To change the default, use the options page.
- Refactor (with AI): replaced six per-render `querySelector(...).addEventListener(...)` calls with a single delegated click handler on the popup root. Buttons in the rendered HTML now declare their behavior via `data-action="…"`. Adding new buttons no longer requires touching the handler code, and a duplicate `cd-close` binding has been removed.

## 0.4.0

- **Filter empty definitions and examples.** Wiktionary occasionally returns blank or whitespace-only definition entries (usually sub-sense placeholders) and embedded `<style>` blocks that leaked through as raw CSS text (e.g. `.mw-parser-output .defdate{font-size:smaller}` appearing at the end of a definition). Both are now stripped before rendering, so the numbered list is clean and no orphan bullets appear under examples.
- **Inflected-form detection.** When you look up a word whose entry is purely a pointer to a base word (e.g. "boxes" → "plural of box", "ran" → "simple past of run", "happier" → "comparative of happy", "recieve" → "misspelling of receive"), the popup shows a chip in the header you can click to jump to the base word. Works for plurals, tenses, participles, gerunds, comparatives, superlatives, misspellings, romanizations, gendered and case forms in other languages, and "(archaic)"-style qualifiers. Words with their own meanings ("glasses", "drunk", "data") are left alone. New setting **Auto-show base word for inflected forms** (off by default) reverses the direction, jumping straight to the lemma with a `← boxes` chip to return.
- **Sticky popup.** The popup now scrolls with the word being defined instead of staying anchored to a fixed viewport position.
- **Page language auto-detect.** When no language preference is set, the popup picker defaults to the page's language (from `<html lang>`). Reading a French article, "chat" defaults to French; reading German, "Bank" defaults to German.
- **Network resilience.** Failed fetches retry once after a 400 ms delay, which catches most transient DNS/connection hiccups silently. When a request really fails, the popup shows a clear "Network error" state with a Retry button instead of the raw `NetworkError when attempting to fetch resource` message.

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

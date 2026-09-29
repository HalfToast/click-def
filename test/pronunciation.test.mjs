// Wiktionary pronunciation: wikitext template parsing, the generator round-trip,
// language matching and audio URLs. Added in 0.5.0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const { api } = await load();

// Trimmed from the real "box" entry: two language sections, explicit IPA with
// an accent label, and audio in both.
const BOX = `==English==

===Pronunciation===
* {{IPA|en|/bɒks/|a=RP}}
* {{IPA|en|/bɑks/}}
* {{audio|en|en-us-box.ogg|a=US}}

===Noun===
# A container.

==Dutch==

===Pronunciation===
* {{IPA|nl|/bɔks/}}
* {{audio|nl|Nl-box.ogg}}
`;

test("parsePronunciation indexes IPA and audio by language code", () => {
  const p = api.parsePronunciation(BOX);
  assert.equal(p.byCode.en.ipa[0].text, "/bɒks/");
  assert.equal(p.byCode.en.ipa[0].accent, "RP");
  assert.equal(p.byCode.en.ipa[1].text, "/bɑks/");
  assert.equal(p.byCode.en.audio[0].file, "en-us-box.ogg");
  assert.equal(p.byCode.nl.ipa[0].text, "/bɔks/");
});

test("parsePronunciation also indexes by section heading", () => {
  // The definition REST API files anything without a short code into a single
  // "other" bucket, so the heading is the only key the two sides share.
  const p = api.parsePronunciation(BOX);
  assert.equal(p.byName.english.ipa[0].text, "/bɒks/");
  assert.equal(p.byName.dutch.ipa[0].text, "/bɔks/");
});

test("{{IPAchar}} is ignored - it carries no language tag", () => {
  // It marks up inline phonetic mentions in etymologies, not the headword.
  const p = api.parsePronunciation("==English==\n{{IPAchar|[ˈwa.tə]|[ˈwa.ɾɚ]}}");
  assert.deepEqual(Object.keys(p.byCode), []);
});

test("a pipe inside a link does not split a template parameter", () => {
  const p = api.parsePronunciation("==English==\n{{IPA|en|/tɛst/|a=<<UK>> [[foo|bar]]}}");
  assert.equal(p.byCode.en.ipa[0].text, "/tɛst/");
});

test("accent labels have their <<link>> markers stripped", () => {
  const p = api.parsePronunciation("==French==\n{{audio|fr|x.wav|a=<<Canada>> (<<Shawinigan>>)}}");
  assert.equal(p.byCode.fr.audio[0].accent, "Canada (Shawinigan)");
});

test("languageSections splits on == headings, not deeper ones", () => {
  const names = api.languageSections(BOX).map((s) => s.name);
  assert.deepEqual(names, ["English", "Dutch"]);
});

test("wikitext with no language heading still parses", () => {
  // Only the byName index goes unfilled; the templates carry their own codes.
  const p = api.parsePronunciation("{{IPA|en|/x/}}");
  assert.equal(p.byCode.en.ipa[0].text, "/x/");
});

test("pronFor matches by code, then falls back to the display name", () => {
  const p = api.parsePronunciation(BOX);
  assert.equal(api.pronFor(p, "en", null).ipa[0].text, "/bɒks/");
  // The REST "other" bucket has no usable code at all.
  assert.equal(api.pronFor(p, "other", "Dutch").ipa[0].text, "/bɔks/");
  assert.equal(api.pronFor(p, "zz", "Klingon"), null);
  assert.equal(api.pronFor(null, "en", "English"), null);
});

test("commonsAudioUrl routes through Special:FilePath", () => {
  // Special:FilePath redirects to the real Commons URL, which avoids both an
  // extra API call and Commons' MD5 path derivation.
  assert.equal(
    api.commonsAudioUrl("LL-Q1860 (eng)-Vealhurl-box.wav"),
    "https://en.wiktionary.org/wiki/Special:FilePath/LL-Q1860_(eng)-Vealhurl-box.wav"
  );
  assert.ok(api.commonsAudioUrl("Es-bo casa.oga").endsWith("Es-bo_casa.oga"), "spaces → underscores");
});

// ---------------------------------------------------------------------------
// fetchPronunciation drives two requests: the page wikitext, then - only when a
// language generates its IPA rather than spelling it out - a render of those
// generator templates. Both are stubbed here; nothing touches the network.
// ---------------------------------------------------------------------------

const CASA = `==Spanish==

===Pronunciation===
{{es-pr|+<audio:Es-bo-casa.oga<a:Bolivia>>}}

===Noun===
# A house.
`;

// What the server returns for the rendered generator snippet, sentinel included.
const RENDERED =
  '<p>CDLANG:0:</p>' +
  '<span class="IPA nowrap">/ˈkasa/</span>' +
  '<span class="IPA nowrap">-asa</span>' +      // a rhyme fragment, must be dropped
  '<a title="File:Es-bo-casa.oga">audio</a>';

function stubServer(wikitext, rendered) {
  return (url) => {
    if (url.includes("prop=wikitext")) return { ok: true, status: 200, body: { parse: { wikitext } } };
    if (url.includes("prop=text")) return { ok: true, status: 200, body: { parse: { text: rendered } } };
    return { ok: false, status: 404, body: null };
  };
}

test("a generated-IPA language is resolved and merged in", async () => {
  const { api: a, calls } = await load({ respond: stubServer(CASA, RENDERED) });
  const p = await a.fetchPronunciation("casa");

  assert.equal(p.byCode.es.ipa[0].text, "/ˈkasa/");
  assert.equal(p.byName.spanish.ipa[0].text, "/ˈkasa/", "filed under the heading too");
  assert.equal(p.byCode.es.audio[0].file, "Es-bo-casa.oga", "generators embed their own audio");
  assert.equal(calls.length, 2, "one wikitext request, one render request");
});

test("rhyme fragments from a generator are filtered out", async () => {
  const { api: a } = await load({ respond: stubServer(CASA, RENDERED) });
  const p = await a.fetchPronunciation("casa");
  // A real transcription is delimited by / / or [ ]; "-asa" is a rhyme.
  assert.ok(p.byCode.es.ipa.every((i) => /^[/[]/.test(i.text)), JSON.stringify(p.byCode.es.ipa));
});

test("no render request when every language spells its IPA out", async () => {
  const { api: a, calls } = await load({ respond: stubServer(BOX, RENDERED) });
  await a.fetchPronunciation("box");
  assert.equal(calls.length, 1, "the generator round-trip must be skipped");
});

test("results are cached per title", async () => {
  const { api: a, calls } = await load({ respond: stubServer(BOX, RENDERED) });
  await a.fetchPronunciation("box");
  const before = calls.length;
  await a.fetchPronunciation("BOX");                 // case-insensitive key
  assert.equal(calls.length, before, "second lookup must not hit the network");
});

test("a missing page yields null rather than throwing", async () => {
  // The action API answers 200 with an { error } body and no `parse`.
  const { api: a } = await load({ respond: () => ({ ok: true, status: 200, body: { error: { code: "missingtitle" } } }) });
  assert.equal(await a.fetchPronunciation("zzqxwv"), null);
});

// Popup rendering: which pronunciation source wins, chip filtering, escaping,
// and the progressive repaint introduced in 0.5.0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const { api } = await load();

const wiktPron = {
  byCode: { de: { ipa: [{ text: "/ˈkatsə/", accent: "" }], audio: [{ file: "De-Katze.ogg" }] } },
  byName: { german: { ipa: [{ text: "/ˈkatsə/", accent: "" }], audio: [{ file: "De-Katze.ogg" }] } }
};
const freeDict = [{ phonetic: "/kætsə/", phonetics: [{ text: "/kætsə/", audio: "https://x/en.mp3" }] }];

test("Wiktionary pronunciation is preferred over the Free Dictionary payload", () => {
  const html = api.renderPhonetics(freeDict, wiktPron, "de", "German");
  assert.match(html, /\/ˈkatsə\//);
  assert.doesNotMatch(html, /kætsə/, "the English-only payload must not win");
});

test("the Free Dictionary payload is only a fallback for English", () => {
  const empty = { byCode: {}, byName: {} };
  assert.match(api.renderPhonetics(freeDict, empty, "en", "English"), /kætsə/);
  // Attaching English phonetics to a German entry would be plainly wrong.
  assert.equal(api.renderPhonetics(freeDict, empty, "de", "German"), "");
});

test("an accent label becomes a tooltip on the transcription", () => {
  const pron = { byCode: { en: { ipa: [{ text: "/bɒks/", accent: "RP" }], audio: [] } }, byName: {} };
  assert.match(api.renderPhonetics(null, pron, "en", "English"), /title="RP"/);
});

test("renderPhonetics emits nothing when there is nothing to show", () => {
  assert.equal(api.renderPhonetics(null, { byCode: {}, byName: {} }, "en", "English"), "");
  assert.equal(api.renderPhonetics([], null, "en", "English"), "");
});

test("isCleanTerm rejects the editorial notes that leaked as chips in 0.4.3", () => {
  assert.equal(api.isCleanTerm('these other third-person pronouns (see "Combined forms", …)'), false);
  assert.equal(api.isCleanTerm("see also something"), false);
  assert.equal(api.isCleanTerm("a phrase with far too many words in it"), false);
  assert.equal(api.isCleanTerm("word; another"), false);
  assert.equal(api.isCleanTerm("a".repeat(31)), false);
  assert.equal(api.isCleanTerm(""), false);
  assert.equal(api.isCleanTerm(null), false);
});

test("isCleanTerm keeps ordinary terms and short phrases", () => {
  for (const t of ["crate", "box seat", "run away", "Latin America"]) {
    assert.equal(api.isCleanTerm(t), true, t);
  }
});

test("escapeHtml neutralises markup in untrusted text", () => {
  assert.equal(api.escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;");
  assert.equal(api.escapeHtml(null), "");
});

// ---------------------------------------------------------------------------
// Progressive rendering: the definition must reach the reader without waiting
// for pronunciation or the thesaurus. Every endpoint is stubbed.
// ---------------------------------------------------------------------------

const DEFINITION = {
  en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: "A container." }] }]
};
const WIKITEXT = "==English==\n===Pronunciation===\n* {{IPA|en|/bɒks/|a=RP}}\n";

function allEndpoints() {
  return (url) => {
    if (url.includes("/api/rest_v1/page/definition/")) return { ok: true, status: 200, body: DEFINITION };
    if (url.includes("prop=wikitext")) return { ok: true, status: 200, body: { parse: { wikitext: WIKITEXT } } };
    if (url.includes("dictionaryapi.dev")) return { ok: false, status: 404, body: null };
    if (url.includes("datamuse.com")) return { ok: true, status: 200, body: [{ word: "crate" }] };
    return { ok: false, status: 404, body: null };
  };
}

test("the definition is painted before the enrichments arrive", async () => {
  const { api: a, renders } = await load({ respond: allEndpoints() });
  await a.lookup("box");

  assert.ok(renders.length >= 3, `expected several repaints, got ${renders.length}`);
  assert.match(renders[0], /Looking up/, "first paint is the loading state");

  const definitionAt = renders.findIndex((h) => h.includes("A container."));
  const ipaAt = renders.findIndex((h) => h.includes("cd-ipa"));
  assert.ok(definitionAt > 0, "the definition must be rendered");
  assert.ok(ipaAt > definitionAt,
    `the definition (paint ${definitionAt}) must land before the IPA (paint ${ipaAt})`);
});

test("a lookup still completes when every enrichment fails", async () => {
  const { api: a, renders } = await load({
    respond: (url) => url.includes("/api/rest_v1/page/definition/")
      ? { ok: true, status: 200, body: DEFINITION }
      : { ok: false, status: 500, body: null }
  });
  await a.lookup("box");
  assert.ok(renders.at(-1).includes("A container."), "the definition survives failing extras");
});

test("a failed definition lookup renders the error state, not a blank popup", async () => {
  const { api: a, renders } = await load({ respond: () => ({ ok: false, status: 404, body: null }) });
  await a.lookup("zzqxwv");
  assert.match(renders.at(-1), /cd-error/);
});

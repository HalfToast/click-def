// Word-shaping and inflected-form detection. Most cases here are regressions
// named in CHANGELOG 0.2.3, 0.4.0, 0.4.2 and 0.4.3.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const { api } = await load();

test("caseVariants tries lowercase first (0.2.3)", () => {
  // Rare words are almost always lowercase; sentence-initial capitals are
  // positional, not semantic, so "Obfuscate" must look up as "obfuscate".
  assert.deepEqual(api.caseVariants("Box"), ["box", "Box", "BOX"]);
  assert.equal(api.caseVariants("Obfuscate")[0], "obfuscate");
});

test("caseVariants de-duplicates", () => {
  assert.deepEqual(api.caseVariants("box"), ["box", "Box", "BOX"]);
  assert.deepEqual(api.caseVariants("DNA"), ["dna", "DNA", "Dna"]);
});

test("lemmaCandidates covers the documented inflections", () => {
  assert.ok(api.lemmaCandidates("boxes").includes("box"));
  assert.ok(api.lemmaCandidates("running").includes("run"));
  assert.ok(api.lemmaCandidates("happily").includes("happy"), "adverb -ily → -y");
  assert.ok(api.lemmaCandidates("cities").includes("city"), "-ies → -y");
});

test("lemmaCandidates does not invent a lemma for an ordinary word", () => {
  // "recieve" is a misspelling, not an inflection - the lemma path must not
  // fire, which is what leaves it to Wiktionary's own misspelling entry.
  assert.deepEqual(api.lemmaCandidates("recieve"), []);
});

test("isFormOfDefinition matches the shapes that regressed in 0.4.2", () => {
  const cases = [
    ["Plural of box.", "box"],
    ["Plural of theory (collective)", "theory"],           // trailing parenthetical
    ["Simple past of run: a colloquial usage", "run"],      // trailing colon clause
    ["Variant of color", "color"],                          // "variant" keyword
    ["Alternative letter-case form of dna", "dna"],         // "letter-case" keyword
    ["Misspelt of receive", "receive"],                     // British "misspelt"
    ["Comparative form of happy", "happy"],
    ["(archaic) (now obsolete) Plural of thou", "thou"]     // nested leading qualifiers
  ];
  for (const [text, want] of cases) {
    assert.equal(api.isFormOfDefinition(text), want, text);
  }
});

test("isFormOfDefinition ignores ordinary definitions that merely contain 'of'", () => {
  const negatives = [
    "A container for storing things.",
    "One of the lenses in a pair of glasses.",
    // Long prefixes are rejected: a real form-of definition is pithy.
    "The act of drinking of water in large amounts before a long journey begins"
  ];
  for (const text of negatives) {
    assert.equal(api.isFormOfDefinition(text), null, text);
  }
});

// Shapes a Wiktionary REST definition response takes, trimmed to what the
// detectors read.
const entry = (...definitions) => ({
  en: [{ partOfSpeech: "Noun", language: "English", definitions: definitions.map((d) => ({ definition: d })) }]
});

test("detectFormOf is strict: every definition must point at the same lemma", () => {
  assert.equal(api.detectFormOf(entry("Plural of box.")), "box");
  assert.equal(api.detectFormOf(entry("Plural of box.", "Simple past of box")), "box");
});

test("detectFormOf refuses when a word also has meanings of its own (0.4.0)", () => {
  // "glasses", "drunk", "data" must never yank the reader to the base word.
  assert.equal(api.detectFormOf(entry("Plural of glass.", "A pair of spectacles.")), null);
  assert.equal(api.detectFormOf(entry("Past participle of drink.", "Intoxicated.")), null);
});

test("detectFormOf refuses when definitions disagree on the lemma", () => {
  assert.equal(api.detectFormOf(entry("Plural of box.", "Plural of bock")), null);
});

test("detectAnyFormOf is loose, which is what 0.4.3 changed", () => {
  // The "→ base word" chip appears whenever ANY definition is a pointer, even
  // though auto-jump (detectFormOf) still requires all of them.
  const rose = entry("A flower with a thorny stem.", "Simple past of rise");
  assert.equal(api.detectFormOf(rose), null, "must not auto-jump");
  assert.equal(api.detectAnyFormOf(rose), "rise", "but must still offer the chip");
});

test("empty and whitespace-only definitions are skipped, not counted (0.4.0)", () => {
  assert.equal(api.detectFormOf(entry("   ", "Plural of box.")), "box");
  assert.equal(api.detectFormOf(entry("")), null, "no real definitions → no lemma");
});

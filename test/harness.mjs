// Loads content.js so its internals can be unit-tested.
//
// content.js is an IIFE with no exports, and it has to stay that way - it is a
// content script, not a module. Rather than restructure production code to make
// it importable, this harness evaluates it in a vm alongside a small stand-in
// for the handful of browser globals it touches, and appends one line that
// hands the internals back out.
//
// That appended line is the only coupling to the file's shape: it matches the
// IIFE's closing "})();". If content.js ever stops ending that way, every test
// fails loudly here rather than silently testing nothing.
//
// It runs through `new Function` rather than `node:vm` so the script shares this
// realm: a vm context has its own Array and Object, which makes every
// deepStrictEqual on a returned value fail on the prototype rather than the
// contents.
//
// Run with:  node --test test/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The internals the suite is allowed to reach. Keeping this list explicit means
// a renamed function breaks the tests that use it, not every test at once.
const EXPOSED = [
  "caseVariants", "lemmaCandidates",
  "isFormOfDefinition", "detectFormOf", "detectAnyFormOf", "pickInitialLang",
  "parsePronunciation", "languageSections", "pronunciationTemplates", "rawTemplateAt",
  "pronFor", "langNameFor", "commonsAudioUrl", "pronAudioUrl", "firstAudioUrl",
  "fetchPronunciation",
  "renderPhonetics", "isCleanTerm", "lookup",
  "applyTheme", "escapeHtml", "stripHtml"
];

// Stands in for DOMParser, which Node does not provide and which stripHtml is
// the only real consumer of. It reproduces what stripHtml relies on - dropping
// <style>/<script> content, dropping remaining tags, decoding the entities
// Wiktionary actually emits - and nothing more. Tests therefore avoid asserting
// on HTML edge cases a real parser would resolve differently.
class StubDOMParser {
  parseFromString(source) {
    const text = String(source)
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return {
      body: { textContent: text, firstChild: null },
      querySelectorAll: () => []
    };
  }
}

export function fakePopup() {
  const classes = new Set();
  return {
    id: "", style: {}, offsetWidth: 320, offsetHeight: 200,
    classList: {
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c)
    },
    classes: () => [...classes].sort(),
    replaceChildren() {}, appendChild() {}, addEventListener() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 })
  };
}

/**
 * @param {object}   [opts]
 * @param {object}   [opts.settings]   overrides merged over content.js's own DEFAULTS
 * @param {boolean}  [opts.systemDark] what matchMedia reports for prefers-color-scheme
 * @param {Function} [opts.respond]    (url, init, timeoutMs) => background-shaped response
 * @returns {Promise<{api, calls, renders, setSettings}>} `renders` collects the
 *          HTML of each popup repaint, oldest first, so a test can watch what
 *          the reader actually sees and when.
 */
export async function load({ settings = {}, systemDark = false, respond } = {}) {
  const source = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
  const exportLine = `__collect({ ${EXPOSED.join(", ")} });\n})();`;
  const patched = source.replace(/\}\)\(\);\s*$/, exportLine);
  if (patched === source) {
    throw new Error("harness: content.js no longer ends with the expected IIFE close");
  }

  const calls = [];
  const renders = [];
  let onChanged = null;
  let popup = null;
  let internals = null;

  const browser = {
    storage: {
      sync: { get: async (defaults) => ({ ...defaults, ...settings }) },
      onChanged: { addListener: (fn) => { onChanged = fn; } }
    },
    runtime: {
      sendMessage: async (msg) => {
        calls.push(msg.url);
        if (!respond) return { ok: false, status: 404, body: null };
        return respond(msg.url, msg.init, msg.timeoutMs);
      }
    }
  };

  // setHtml is the only caller that wraps its input in a <div>; stripHtml's
  // parses are left alone so they don't pollute the render log.
  class RecordingDOMParser extends StubDOMParser {
    parseFromString(source) {
      if (String(source).startsWith("<div>")) renders.push(String(source));
      return super.parseFromString(source);
    }
  }

  const documentStub = {
    addEventListener() {},
    createElement: () => (popup = fakePopup()),
    getElementById: () => popup,
    documentElement: { lang: "" },
    body: { appendChild() {} }
  };

  const windowStub = {
    getSelection: () => null,
    scrollX: 0, scrollY: 0, innerWidth: 1200, innerHeight: 800
  };

  const matchMediaStub = (q) => ({
    matches: /prefers-color-scheme:\s*dark/.test(q) ? systemDark : false,
    addEventListener() {}
  });

  // eslint-disable-next-line no-new-func
  const run = new Function(
    "document", "window", "matchMedia", "browser", "DOMParser", "Audio", "__collect",
    patched
  );
  run(
    documentStub, windowStub, matchMediaStub, browser, RecordingDOMParser,
    class { play() { return Promise.resolve(); } },
    (exposed) => { internals = exposed; }
  );

  // content.js reads its settings from storage asynchronously; let that land
  // before handing the internals to a test.
  await new Promise((resolve) => setImmediate(resolve));

  return {
    api: internals,
    calls,
    renders,
    // Drives the real storage.onChanged path rather than poking at internals.
    setSettings(patch) {
      const changes = {};
      for (const [k, v] of Object.entries(patch)) changes[k] = { newValue: v };
      onChanged?.(changes, "sync");
    }
  };
}

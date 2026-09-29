// Settings plumbing. These are cheap structural checks for the kind of drift
// that no amount of careful editing reliably prevents: the same defaults are
// declared in two files, and every one of them needs a control on the options
// page to be reachable at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { load, fakePopup, ROOT } from "./harness.mjs";

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function defaultsKeys(file) {
  const src = read(file);
  const start = src.indexOf("DEFAULTS = {");
  assert.notEqual(start, -1, `${file}: no DEFAULTS object`);
  const body = src.slice(start, src.indexOf("};", start));
  return [...body.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
}

test("content.js and options.js declare the same settings", () => {
  // They are separate files with no shared module, so nothing but this check
  // stops one from gaining a setting the other never learns about.
  const inContent = defaultsKeys("content.js");
  const inOptions = defaultsKeys("options.js");
  assert.deepEqual([...inContent].sort(), [...inOptions].sort());
});

test("every setting has a control on the options page", () => {
  // A setting with no control can be stored but never changed by the user.
  const html = read("options.html");
  const ids = [...html.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const missing = defaultsKeys("options.js").filter((k) => !ids.includes(k));
  assert.deepEqual(missing, [], `settings with no control: ${missing.join(", ")}`);
});

test("the theme control offers exactly the values applyTheme understands", () => {
  const html = read("options.html");
  const select = html.slice(html.indexOf('<select id="theme">'));
  const values = [...select.slice(0, select.indexOf("</select>")).matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ["auto", "light", "dark"]);
});

test("the manifest version matches the top of the changelog", () => {
  const version = JSON.parse(read("manifest.json")).version;
  const heading = read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)/m)[1];
  assert.equal(version, heading);
});

// ---------------------------------------------------------------------------
// Theme resolution. "auto" is resolved in JS rather than CSS, so the stylesheet
// carries one dark block instead of a media query plus an override.
// ---------------------------------------------------------------------------

const MATRIX = [
  // theme,   systemDark, expected class
  ["auto",    false,      "cd-theme-light"],
  ["auto",    true,       "cd-theme-dark"],
  ["light",   false,      "cd-theme-light"],
  ["light",   true,       "cd-theme-light"],  // an explicit choice beats the system
  ["dark",    false,      "cd-theme-dark"],   // in both directions
  ["dark",    true,       "cd-theme-dark"]
];

for (const [theme, systemDark, expected] of MATRIX) {
  test(`theme=${theme} on a ${systemDark ? "dark" : "light"} system → ${expected}`, async () => {
    const { api } = await load({ settings: { theme }, systemDark });
    const popup = fakePopup();
    api.applyTheme(popup);
    assert.deepEqual(popup.classes(), [expected], "exactly one theme class must be set");
  });
}

test("changing the theme setting takes effect without a reload", async () => {
  const { api, setSettings } = await load({ settings: { theme: "light" }, systemDark: false });
  const popup = fakePopup();
  api.applyTheme(popup);
  assert.deepEqual(popup.classes(), ["cd-theme-light"]);

  setSettings({ theme: "dark" });   // drives the real storage.onChanged path
  api.applyTheme(popup);
  assert.deepEqual(popup.classes(), ["cd-theme-dark"]);
});

test("the stylesheets key off the class the script actually sets", () => {
  // If these drift apart the popup silently renders in the wrong theme.
  const content = read("content.css");
  assert.ok(content.includes("#click-define-popup.cd-theme-dark"), "content.css has no dark rules");
  assert.doesNotMatch(content, /@media[^{]*prefers-color-scheme/,
    "content.css must not also switch on the media query");
  assert.ok(read("options.css").includes("html.cd-theme-dark"), "options.css has no dark rules");
});

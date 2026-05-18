(() => {
  const POPUP_ID = "click-define-popup";
  const MARGIN = 8;

  const DEFAULTS = {
    showPronunciation: true,
    showSynonyms: true,
    showAntonyms: true,
    showExamples: false,
    autoExpand: false,
    requireModifier: false,
    autoPlayAudio: false,
    maxShortDefs: 2,
    useFreeDictionary: true,
    preferredLanguage: "auto",
    autoResolveForms: false
  };

  const ext = (typeof browser !== "undefined" ? browser : chrome);
  const storageApi = ext.storage.sync;
  let settings = { ...DEFAULTS };

  storageApi.get(DEFAULTS).then((s) => { settings = { ...DEFAULTS, ...s }; });
  ext.storage.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k in changes) settings[k] = changes[k].newValue;
  });

  let currentWord = null;
  let currentWiktionary = null;
  let currentDictionary = null;
  let currentSyn = [];
  let currentAnt = [];
  let expanded = false;
  let lastRect = null;
  let selectedLang = null;
  let resolvedFrom = null;  // we auto-resolved to a lemma; this is the original form
  let formOfTarget = null;  // we're showing a form's entry; this is the lemma it points to
  let lookupSeq = 0;        // monotonic counter to detect superseded async lookups
  const history = []; // stack of previous words for back button

  const isTouch = matchMedia("(pointer: coarse)").matches;

  document.addEventListener("dblclick", onDblClick, true);
  document.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("touchstart", onOutsideMouseDown, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // Mobile: long-press selects text and fires selectionchange. Debounce until the
  // selection stabilizes, then trigger a lookup if it resolves to a single word.
  if (isTouch) {
    let selTimer = null;
    document.addEventListener("selectionchange", () => {
      clearTimeout(selTimer);
      selTimer = setTimeout(handleTouchSelection, 450);
    });
  }

  function handleTouchSelection() {
    const popup = document.getElementById(POPUP_ID);
    if (popup) return; // already showing something
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const text = sel.toString().trim();
    if (!text || /\s/.test(text)) return; // only single-word selections
    triggerLookup(sel);
  }

  function onOutsideMouseDown(e) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;
    const target = e.target || (e.touches && e.touches[0]?.target);
    if (target && !popup.contains(target)) removePopup();
  }

  async function onDblClick(e) {
    if (settings.requireModifier && !e.altKey) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    triggerLookup(sel);
  }

  async function triggerLookup(sel) {
    const text = sel.toString().trim();
    if (!text) return;

    const raw = text.split(/\s+/)[0].replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, "");
    const word = raw.normalize("NFC");
    if (!word) return;
    // Reject pure-number/punctuation selections (e.g. "2024", "1999") — these
    // either 404 on Wiktionary or surface the literal page for the number.
    if (!/\p{L}/u.test(word)) return;

    const range = sel.getRangeAt(0);
    lastRect = range.getBoundingClientRect();
    history.length = 0;
    await lookup(word);
  }

  async function lookup(word, opts = {}) {
    const skipResolve = !!opts.skipResolve;
    const fromForm = opts.fromForm || null;
    const seq = ++lookupSeq;

    currentWord = word;
    currentWiktionary = null;
    currentDictionary = null;
    currentSyn = [];
    currentAnt = [];
    expanded = !!settings.autoExpand;
    selectedLang = null;
    resolvedFrom = fromForm;
    formOfTarget = null;

    showPopup(lastRect, renderLoading(word));

    let wikt;
    try {
      wikt = await fetchWiktionary(word);
    } catch (err) {
      wikt = { error: err.message, network: !!err.network };
    }
    if (seq !== lookupSeq) return; // superseded by a newer lookup

    // Detect inflected forms. Behavior depends on the autoResolveForms setting:
    //   - true  → recurse into the lemma immediately (and show "← form" breadcrumb).
    //   - false → keep showing the form's entry but expose a "→ lemma" chip so the
    //             user can navigate to the base word manually. Default.
    if (!skipResolve && !fromForm && wikt && !wikt.error) {
      const strict = detectFormOf(wikt);
      if (strict && strict.toLowerCase() !== word.toLowerCase() && settings.autoResolveForms) {
        return lookup(strict, { fromForm: word });
      }
      // Show a "→ base word" chip if ANY definition is a form-of pointer, even
      // when the word also has its own meanings (e.g. "rose" → "rise").
      const lemma = strict || detectAnyFormOf(wikt);
      if (lemma && lemma.toLowerCase() !== word.toLowerCase()) {
        formOfTarget = lemma;
      }
    }

    currentWiktionary = wikt;

    const tasks = [
      settings.useFreeDictionary ? fetchFreeDictionary(word).catch(() => null) : Promise.resolve(null),
      (settings.showSynonyms ? fetchDatamuse(word, "rel_syn") : Promise.resolve([])).catch(() => []),
      (settings.showAntonyms ? fetchDatamuse(word, "rel_ant") : Promise.resolve([])).catch(() => [])
    ];

    const [dict, syns, ants] = await Promise.all(tasks);
    if (seq !== lookupSeq) return; // superseded

    currentDictionary = dict;
    currentSyn = syns || [];
    currentAnt = ants || [];
    selectedLang = pickInitialLang(wikt);

    rerender();

    if (settings.autoPlayAudio) {
      const audioUrl = firstAudioUrl(currentDictionary);
      if (audioUrl) playAudio(audioUrl);
    }
  }

  // Returns the lemma if every definition in the language we'd display is a
  // form-of pointer (e.g. "Plural of box", "Simple past of run", "Misspelling of
  // receive"). Only checks the active language to avoid cross-language false
  // positives (e.g. "Ran" has English meanings but a Manx entry pointing to "Arran").
  //
  // Detection is structural: a definition counts as form-of when it ends with
  // "of WORD." (or close to it) AND the prefix contains at least one of a known
  // list of grammatical keywords. This is broader and more robust than a single
  // enumerated phrase pattern.
  const FORM_KEYWORDS = /(?:^|[^\p{L}])(plural|singular|dual|past|present|future|tense|participle|gerund|comparative|superlative|feminine|masculine|neuter|diminutive|augmentative|genitive|accusative|dative|nominative|vocative|locative|instrumental|ablative|ergative|infinitive|imperative|subjunctive|indicative|conditional|optative|imperfect|perfect|pluperfect|preterite|aorist|continuous|progressive|active|passive|reflexive|honorific|polite|inflection|inflected|conjugation|conjugated|misspelling|misspelt|abbreviation|abbreviated|acronym|initialism|contraction|contracted|romanization|transliteration|romaji|hiragana|katakana|kanji|first|second|third|person|variant|letter[\-‑\s]case|alternative\s+(?:form|spelling|letter[\-‑\s]case)|obsolete\s+(?:form|spelling)|archaic\s+(?:form|spelling)|eye\s+dialect|standard\s+spelling|nonstandard\s+spelling|deprecated\s+(?:form|spelling))(?:$|[^\p{L}])/iu;

  function isFormOfDefinition(text) {
    if (!text) return null;
    // Strip leading parenthetical qualifiers (possibly nested/repeated) like
    // "(archaic) (now obsolete) Plural of …".
    let t = text.trim();
    while (/^\(\s*[^()]+\s*\)\s*/u.test(t)) t = t.replace(/^\(\s*[^()]+\s*\)\s*/u, "");

    // Find "of <word>" — first occurrence, since form-of definitions start with
    // the keywords + "of" close to the front. The word may be followed by more
    // text (parenthetical examples, colons, qualifiers), which we ignore.
    const m = t.match(/\bof\s+["'“]?([\p{L}][\p{L}'\-]*)["'”]?/iu);
    if (!m) return null;
    const prefix = t.slice(0, m.index).trim();

    // Prefix should be short (form-of definitions are pithy) and contain a
    // grammatical keyword. Reject anything longer than ~60 chars before "of".
    if (prefix.length === 0 || prefix.length > 60) return null;
    if (!FORM_KEYWORDS.test(prefix)) return null;
    return m[1];
  }

  // Strict: lemma only if EVERY non-empty definition in the displayed language
  // is a form-of pointer to the same base word. Used for the auto-resolve jump,
  // so we never yank the user away from words that have their own meanings
  // (e.g. "drunk", "glasses", "rose").
  function detectFormOf(wikt) {
    const lang = pickInitialLang(wikt);
    if (!lang || !wikt[lang]) return null;
    const entries = wikt[lang];

    let target = null;
    let defCount = 0;

    for (const entry of entries) {
      for (const d of entry.definitions || []) {
        const text = stripHtml(d.definition).trim();
        if (!text) continue; // skip empty placeholder entries
        defCount++;
        const t = isFormOfDefinition(text);
        if (!t) return null;
        if (target && target.toLowerCase() !== t.toLowerCase()) return null;
        target = t;
      }
    }

    return defCount > 0 ? target : null;
  }

  // Loose: lemma from the FIRST definition that is a form-of pointer, even if
  // the word also has its own meanings. Used to offer the "→ base word"
  // breadcrumb chip — purely additive, never auto-jumps.
  function detectAnyFormOf(wikt) {
    const lang = pickInitialLang(wikt);
    if (!lang || !wikt[lang]) return null;

    for (const entry of wikt[lang]) {
      for (const d of entry.definitions || []) {
        const text = stripHtml(d.definition).trim();
        if (!text) continue;
        const t = isFormOfDefinition(text);
        if (t) return t;
      }
    }
    return null;
  }

  function rerender() {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;
    setHtml(popup, renderContent());
    positionPopup(popup, lastRect);
  }

  function setHtml(el, html) {
    el.replaceChildren();
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const wrapper = doc.body.firstChild;
    while (wrapper && wrapper.firstChild) el.appendChild(wrapper.firstChild);
  }

  // Single delegated click handler. Buttons in the rendered HTML declare what
  // they do via data-action, plus extra data-* attrs the action needs. This
  // replaces six per-render querySelector/addEventListener pairs and means
  // adding a new button only requires data-action="…" in the template.
  function onPopupClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "close":
        removePopup();
        break;
      case "back": {
        const prev = history.pop();
        if (prev) lookup(prev);
        break;
      }
      case "retry":
        if (currentWord) lookup(currentWord, { skipResolve: !!resolvedFrom });
        break;
      case "expand":
        expanded = !expanded;
        rerender();
        break;
      case "audio":
        if (btn.dataset.url) playAudio(btn.dataset.url);
        break;
      case "lookup": {
        const w = btn.dataset.word;
        if (!w || w === currentWord) return;
        history.push(currentWord);
        lookup(w);
        break;
      }
      case "form-jump": {
        const target = btn.dataset.word;
        if (!target) return;
        history.push(currentWord);
        // mode=form  → view the literal inflected form, skip resolution
        // mode=lemma → navigate to base word, normal lookup behavior
        lookup(target, { skipResolve: btn.dataset.mode === "form" });
        break;
      }
    }
  }

  function onPopupChange(e) {
    if (!e.target.classList?.contains("cd-langselect")) return;
    // Per-lookup override only; do NOT persist. The persistent default lives
    // in settings.preferredLanguage and is set from the options page.
    selectedLang = e.target.value;
    rerender();
  }

  function pickInitialLang(wikt) {
    if (!wikt || wikt.error) return null;
    const langs = Object.keys(wikt);
    if (!langs.length) return null;
    const pref = settings.preferredLanguage;
    if (pref && pref !== "auto" && langs.includes(pref)) return pref;
    // Auto: use <html lang="…"> if it matches a Wiktionary code, then English, then first.
    const pageLang = (document.documentElement.lang || "").split(/[-_]/)[0].toLowerCase();
    if (pageLang && langs.includes(pageLang)) return pageLang;
    if (langs.includes("en")) return "en";
    return langs[0];
  }

  function caseVariants(word) {
    const variants = [];
    const seen = new Set();
    const push = (w) => {
      if (w && !seen.has(w)) { seen.add(w); variants.push(w); }
    };
    // Lowercase first: difficult/rare words are almost always lowercase common-noun/verb/adj forms.
    // Sentence-initial capitalization is positional, not semantic, so we should treat "Obfuscate"
    // and "obfuscate" the same. Proper nouns (Apple, DNA) fall through to the next variants.
    push(word.toLowerCase());
    push(word);
    push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    push(word.toUpperCase());
    return variants;
  }

  // Crude lemma candidates — strips common English suffixes.
  // Generates extras like "running" → "run", "boxes" → "box", "happily" → "happy".
  function lemmaCandidates(word) {
    const w = word.toLowerCase();
    const out = new Set();
    const add = (s) => { if (s && s.length >= 2 && s !== w) out.add(s); };

    if (w.endsWith("ies") && w.length > 4) add(w.slice(0, -3) + "y"); // parties → party
    if (w.endsWith("es") && w.length > 3) add(w.slice(0, -2));        // boxes → box
    if (w.endsWith("s") && w.length > 2) add(w.slice(0, -1));         // cats → cat
    if (w.endsWith("ed") && w.length > 3) {
      add(w.slice(0, -2));                                            // walked → walk
      add(w.slice(0, -1));                                            // liked → like
    }
    if (w.endsWith("ing") && w.length > 4) {
      add(w.slice(0, -3));                                            // walking → walk
      add(w.slice(0, -3) + "e");                                      // making → make
      // doubled consonant: running → run
      const stem = w.slice(0, -3);
      if (stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2]) {
        add(stem.slice(0, -1));
      }
    }
    if (w.endsWith("ily") && w.length > 4) add(w.slice(0, -3) + "y"); // happily → happy
    if (w.endsWith("ly") && w.length > 3) add(w.slice(0, -2));        // quickly → quick
    if (w.endsWith("er") && w.length > 3) add(w.slice(0, -2));        // bigger → big-ish
    if (w.endsWith("est") && w.length > 4) add(w.slice(0, -3));       // biggest

    return [...out];
  }

  // Route all network requests through the background script. In Firefox a
  // content-script fetch() is governed by the host page's CSP (connect-src),
  // so strict sites (WhatsApp Web, GitHub, some banks) block lookups. The
  // background page has no such restriction. Returns a normalized result:
  //   { ok, status, body } on an HTTP response, or
  //   { error, network }   on a transport-level failure.
  async function apiFetch(url, init) {
    try {
      const r = await ext.runtime.sendMessage({ type: "cd-fetch", url, init });
      return r || { error: "No response from background", network: true };
    } catch (e) {
      return { error: (e && e.message) || String(e), network: true };
    }
  }

  // Retry once after a short delay on transport-level failures (most are
  // transient: DNS hiccups, dropped connections, brief Wi-Fi blips).
  async function apiFetchRetry(url, init) {
    let r = await apiFetch(url, init);
    if (r && r.network) {
      await new Promise((res) => setTimeout(res, 400));
      r = await apiFetch(url, init);
    }
    return r;
  }

  async function fetchWiktionary(word) {
    let lastErr;
    let networkFailed = false;
    const tryVariant = async (v) => {
      const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(v)}`;
      const r = await apiFetchRetry(url, { headers: { Accept: "application/json" } });
      if (r.network) { networkFailed = true; return null; }
      if (r.ok) return r.body;
      if (r.status && r.status !== 404) throw new Error(`Lookup failed (${r.status})`);
      return null;
    };

    for (const variant of caseVariants(word)) {
      try {
        const r = await tryVariant(variant);
        if (r) return r;
      } catch (e) { lastErr = e; }
    }
    // Lemma fallbacks
    for (const lemma of lemmaCandidates(word)) {
      for (const variant of caseVariants(lemma)) {
        try {
          const r = await tryVariant(variant);
          if (r) return r;
        } catch (e) { lastErr = e; }
      }
    }
    if (networkFailed) {
      const err = new Error("NETWORK");
      err.network = true;
      throw err;
    }
    throw lastErr || new Error("No definition found.");
  }

  async function fetchFreeDictionary(word) {
    const candidates = [...caseVariants(word), ...lemmaCandidates(word)];
    for (const variant of candidates) {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(variant)}`;
      const r = await apiFetchRetry(url, { headers: { Accept: "application/json" } });
      if (r.ok && r.body) return r.body;
    }
    return null;
  }

  async function fetchDatamuse(word, rel) {
    const url = `https://api.datamuse.com/words?${rel}=${encodeURIComponent(word.toLowerCase())}&max=20`;
    const r = await apiFetchRetry(url);
    if (r.ok && Array.isArray(r.body)) return r.body.map((d) => d.word).filter(Boolean);
    return [];
  }

  function showPopup(rect, html) {
    removePopup();
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    setHtml(popup, html);
    document.body.appendChild(popup);
    positionPopup(popup, rect);
    // Delegated listeners — attached once; survive rerender() since setHtml()
    // only replaces children, not the popup element itself.
    popup.addEventListener("click", onPopupClick);
    popup.addEventListener("change", onPopupChange);
  }

  function positionPopup(popup, rect) {
    if (!rect) return;
    popup.style.left = "0px";
    popup.style.top = "0px";
    popup.style.maxHeight = "none";

    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;

    let top, left;
    if (spaceAbove >= ph + MARGIN || spaceAbove >= spaceBelow) {
      top = rect.top - ph - MARGIN;
      if (top < MARGIN) {
        popup.style.maxHeight = `${spaceAbove - MARGIN * 2}px`;
        top = MARGIN;
      }
    } else {
      top = rect.bottom + MARGIN;
      if (top + ph > vh - MARGIN) {
        popup.style.maxHeight = `${spaceBelow - MARGIN * 2}px`;
      }
    }

    left = rect.left + rect.width / 2 - pw / 2;
    if (left < MARGIN) left = MARGIN;
    if (left + pw > vw - MARGIN) left = vw - pw - MARGIN;

    // Document coordinates with position: absolute so the popup sticks to the
    // word being defined — when the page scrolls, the popup scrolls with it.
    popup.style.left = `${left + window.scrollX}px`;
    popup.style.top = `${top + window.scrollY}px`;
  }

  function removePopup() {
    document.getElementById(POPUP_ID)?.remove();
  }

  function playAudio(url) {
    try { new Audio(url).play().catch(() => {}); } catch {}
  }

  // ---------- rendering ----------

  function renderLoading(word) {
    return `
      <div class="cd-header">
        ${renderBackBtn()}
        <span class="cd-word">${escapeHtml(word)}</span>
        <button class="cd-close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="cd-body cd-loading">Looking up…</div>
    `;
  }

  function renderError(word, msg, isNetwork) {
    const body = isNetwork
      ? `<div class="cd-body cd-error">
           <div class="cd-net-icon">⚠</div>
           <div class="cd-net-msg">Network error</div>
           <div class="cd-net-sub">Could not reach the dictionary. Check your connection and try again.</div>
         </div>`
      : `<div class="cd-body cd-error">${escapeHtml(msg)}</div>`;

    const footer = isNetwork
      ? `<div class="cd-footer">
           <button class="cd-retry" data-action="retry">Retry</button>
           <a class="cd-link" href="https://en.wiktionary.org/wiki/${encodeURIComponent(word)}" target="_blank" rel="noopener">Open in Wiktionary</a>
         </div>`
      : `<div class="cd-footer">
           <a class="cd-link" href="https://en.wiktionary.org/wiki/${encodeURIComponent(word)}" target="_blank" rel="noopener">Open in Wiktionary</a>
         </div>`;

    return `
      <div class="cd-header">
        ${renderBackBtn()}
        <span class="cd-word">${escapeHtml(word)}</span>
        <button class="cd-close" data-action="close" aria-label="Close">×</button>
      </div>
      ${body}
      ${footer}
    `;
  }

  function renderBackBtn() {
    if (!history.length) return "";
    return `<button class="cd-back" data-action="back" title="Back" aria-label="Back">←</button>`;
  }

  function renderResolvedFrom() {
    if (resolvedFrom) {
      return `<button class="cd-resolved" data-action="form-jump" data-word="${escapeHtml(resolvedFrom)}" data-mode="form" title="View “${escapeHtml(resolvedFrom)}” as its own entry">← ${escapeHtml(resolvedFrom)}</button>`;
    }
    if (formOfTarget) {
      return `<button class="cd-resolved" data-action="form-jump" data-word="${escapeHtml(formOfTarget)}" data-mode="lemma" title="View base word “${escapeHtml(formOfTarget)}”">→ ${escapeHtml(formOfTarget)}</button>`;
    }
    return "";
  }

  function renderContent() {
    const word = currentWord;
    const wikt = currentWiktionary;

    if (!wikt || wikt.error) {
      return renderError(word, wikt?.error || "No definition found.", !!wikt?.network);
    }

    const phonHtml = settings.showPronunciation ? renderPhonetics(currentDictionary) : "";
    const synAntHtml = renderSynAnt();

    const allLangs = Object.keys(wikt);
    if (!allLangs.length) return renderError(word, "No definitions found.");

    const activeLang = selectedLang && wikt[selectedLang] ? selectedLang : (allLangs.includes("en") ? "en" : allLangs[0]);
    const langPickerHtml = renderLangPicker(wikt, activeLang);

    const entries = wikt[activeLang];
    const langName = entries[0]?.language || activeLang;
    const posBlocks = entries.map((entry) => {
      // Wiktionary occasionally returns empty or whitespace-only entries (header
      // rows, sub-sense placeholders). Drop them before slicing so the user sees
      // real definitions in the visible range.
      const defs = (entry.definitions || []).filter((d) => stripHtml(d.definition).trim().length > 0);
      if (!defs.length) return "";
      const limit = Math.max(1, Number(settings.maxShortDefs) || 2);
      const shown = expanded ? defs : defs.slice(0, limit);
      const items = shown.map((d) => {
        const text = stripHtml(d.definition);
        const cleanExamples = (d.examples || [])
          .map((ex) => stripHtml(ex))
          .filter((ex) => ex.length > 0);
        const showEx = (expanded || settings.showExamples) && cleanExamples.length > 0;
        const examples = showEx
          ? `<div class="cd-examples">${cleanExamples
              .map((ex) => `<div class="cd-example">${escapeHtml(ex)}</div>`)
              .join("")}</div>`
          : "";
        return `<li>${escapeHtml(text)}${examples}</li>`;
      }).join("");
      return `
        <div class="cd-pos-block">
          <div class="cd-pos">${escapeHtml(entry.partOfSpeech || "")}</div>
          <ol class="cd-defs">${items}</ol>
        </div>
      `;
    }).join("");
    const sections = `
      <div class="cd-lang-block">
        <div class="cd-lang">${escapeHtml(langName)}</div>
        ${posBlocks}
      </div>
    `;

    const expandLabel = expanded ? "Show less" : "Show full definition";

    return `
      <div class="cd-header">
        ${renderBackBtn()}
        <span class="cd-word">${escapeHtml(word)}</span>
        ${renderResolvedFrom()}
        ${phonHtml}
        ${langPickerHtml}
        <button class="cd-close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="cd-body">
        ${synAntHtml}
        ${sections}
      </div>
      <div class="cd-footer">
        <button class="cd-expand" data-action="expand">${expandLabel}</button>
        <a class="cd-link" href="https://en.wiktionary.org/wiki/${encodeURIComponent(word)}" target="_blank" rel="noopener">Wiktionary ↗</a>
      </div>
    `;
  }

  function renderLangPicker(wikt, activeLang) {
    const langs = Object.keys(wikt);
    if (langs.length < 2) return "";
    langs.sort((a, b) => {
      const an = wikt[a][0]?.language || a;
      const bn = wikt[b][0]?.language || b;
      return an.localeCompare(bn);
    });
    const opts = langs.map((code) => {
      const name = wikt[code][0]?.language || code;
      const sel = code === activeLang ? " selected" : "";
      return `<option value="${escapeHtml(code)}"${sel}>${escapeHtml(name)}</option>`;
    }).join("");
    return `<select class="cd-langselect" title="Definition language" aria-label="Language">${opts}</select>`;
  }

  function renderPhonetics(dict) {
    if (!Array.isArray(dict) || !dict.length) return "";
    const phonetics = dict[0].phonetics || [];
    const ipa = dict[0].phonetic || phonetics.find((p) => p.text)?.text || "";
    const audio = phonetics.find((p) => p.audio)?.audio || "";
    if (!ipa && !audio) return "";

    const parts = [];
    if (ipa) parts.push(`<span class="cd-ipa">${escapeHtml(ipa)}</span>`);
    if (audio) {
      parts.push(`<button class="cd-audio" data-action="audio" data-url="${escapeHtml(audio)}" title="Play pronunciation" aria-label="Play pronunciation">🔊</button>`);
    }
    return `<span class="cd-phon">${parts.join("")}</span>`;
  }

  function renderSynAnt() {
    if (!settings.showSynonyms && !settings.showAntonyms) return "";

    const synonyms = new Set();
    const antonyms = new Set();

    // From Free Dictionary (English-only, but contextual)
    if (Array.isArray(currentDictionary)) {
      for (const entry of currentDictionary) {
        for (const m of entry.meanings || []) {
          (m.synonyms || []).forEach((s) => synonyms.add(s));
          (m.antonyms || []).forEach((a) => antonyms.add(a));
          for (const def of m.definitions || []) {
            (def.synonyms || []).forEach((s) => synonyms.add(s));
            (def.antonyms || []).forEach((a) => antonyms.add(a));
          }
        }
      }
    }
    // From Datamuse (richer English thesaurus)
    currentSyn.forEach((s) => synonyms.add(s));
    currentAnt.forEach((a) => antonyms.add(a));

    const limit = expanded ? 30 : 8;
    const blocks = [];
    const syn = [...synonyms].filter(isCleanTerm);
    const ant = [...antonyms].filter(isCleanTerm);
    if (settings.showSynonyms && syn.length) {
      blocks.push(renderChipRow("Synonyms", syn.slice(0, limit)));
    }
    if (settings.showAntonyms && ant.length) {
      blocks.push(renderChipRow("Antonyms", ant.slice(0, limit)));
    }
    return blocks.join("");
  }

  // The Free Dictionary API occasionally stores editorial notes in its
  // synonyms/antonyms arrays (e.g. 'these other third-person pronouns (see
  // "Combined forms", …)'). Keep only entries that look like actual terms:
  // short, few words, no sentence punctuation, brackets, or quotes.
  function isCleanTerm(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (t.length < 1 || t.length > 30) return false;
    if (t.split(/\s+/).length > 3) return false;          // at most a short phrase
    if (/[(){}\[\]"“”;:]|see\s|\.\.\.|—|–/i.test(t)) return false;
    return true;
  }

  function renderChipRow(label, items) {
    const chips = items.map((i) =>
      `<button class="cd-chip" data-action="lookup" data-word="${escapeHtml(i)}" title="Look up “${escapeHtml(i)}”">${escapeHtml(i)}</button>`
    ).join("");
    return `
      <div class="cd-chiprow">
        <div class="cd-chiplabel">${label}</div>
        <div class="cd-chips">${chips}</div>
      </div>
    `;
  }

  function firstAudioUrl(dict) {
    if (!Array.isArray(dict)) return null;
    for (const entry of dict) {
      for (const p of entry.phonetics || []) {
        if (p.audio) return p.audio;
      }
    }
    return null;
  }

  function stripHtml(s) {
    if (!s) return "";
    const doc = new DOMParser().parseFromString(s, "text/html");
    // <style> and <script> contribute their raw CSS/JS to textContent — strip them.
    doc.querySelectorAll("style, script").forEach((n) => n.remove());
    return (doc.body.textContent || "").trim();
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();

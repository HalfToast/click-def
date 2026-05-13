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
    preferredLanguage: "auto"
  };

  const storageApi = (typeof browser !== "undefined" ? browser : chrome).storage.sync;
  let settings = { ...DEFAULTS };

  storageApi.get(DEFAULTS).then((s) => { settings = { ...DEFAULTS, ...s }; });
  if (typeof browser !== "undefined" || typeof chrome !== "undefined") {
    const runtime = (typeof browser !== "undefined" ? browser : chrome);
    runtime.storage.onChanged?.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const k in changes) settings[k] = changes[k].newValue;
    });
  }

  let currentWord = null;
  let currentWiktionary = null;
  let currentDictionary = null;
  let currentSyn = [];
  let currentAnt = [];
  let expanded = false;
  let lastRect = null;
  let selectedLang = null;
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

    const range = sel.getRangeAt(0);
    lastRect = range.getBoundingClientRect();
    history.length = 0;
    await lookup(word);
  }

  async function lookup(word) {
    currentWord = word;
    currentWiktionary = null;
    currentDictionary = null;
    currentSyn = [];
    currentAnt = [];
    expanded = !!settings.autoExpand;
    selectedLang = null;

    showPopup(lastRect, renderLoading(word));

    const tasks = [
      fetchWiktionary(word).catch((err) => ({ error: err.message })),
      settings.useFreeDictionary ? fetchFreeDictionary(word).catch(() => null) : Promise.resolve(null),
      (settings.showSynonyms ? fetchDatamuse(word, "rel_syn") : Promise.resolve([])).catch(() => []),
      (settings.showAntonyms ? fetchDatamuse(word, "rel_ant") : Promise.resolve([])).catch(() => [])
    ];

    const [wikt, dict, syns, ants] = await Promise.all(tasks);
    currentWiktionary = wikt;
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

  function rerender() {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;
    setHtml(popup, renderContent());
    positionPopup(popup, lastRect);
    bindHandlers();
  }

  function setHtml(el, html) {
    el.replaceChildren();
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const wrapper = doc.body.firstChild;
    while (wrapper && wrapper.firstChild) el.appendChild(wrapper.firstChild);
  }

  function bindHandlers() {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    popup.querySelector(".cd-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      removePopup();
    });

    popup.querySelector(".cd-back")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const prev = history.pop();
      if (prev) lookup(prev);
    });

    popup.querySelector(".cd-expand")?.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded = !expanded;
      rerender();
    });

    popup.querySelectorAll(".cd-audio").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        if (url) playAudio(url);
      });
    });

    popup.querySelectorAll(".cd-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const w = chip.dataset.word;
        if (!w || w === currentWord) return;
        history.push(currentWord);
        lookup(w);
      });
    });

    const langSel = popup.querySelector(".cd-langselect");
    if (langSel) {
      langSel.addEventListener("change", (e) => {
        e.stopPropagation();
        selectedLang = langSel.value;
        storageApi.set({ preferredLanguage: selectedLang }).catch(() => {});
        rerender();
      });
      langSel.addEventListener("mousedown", (e) => e.stopPropagation());
      langSel.addEventListener("click", (e) => e.stopPropagation());
    }
  }

  function pickInitialLang(wikt) {
    if (!wikt || wikt.error) return null;
    const langs = Object.keys(wikt);
    if (!langs.length) return null;
    const pref = settings.preferredLanguage;
    if (pref && pref !== "auto" && langs.includes(pref)) return pref;
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

  async function fetchWiktionary(word) {
    let lastErr;
    const tryVariant = async (v) => {
      const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(v)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return res.json();
      if (res.status !== 404) throw new Error(`Lookup failed (${res.status})`);
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
    throw lastErr || new Error("No definition found.");
  }

  async function fetchFreeDictionary(word) {
    const candidates = [...caseVariants(word), ...lemmaCandidates(word)];
    for (const variant of candidates) {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(variant)}`;
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) return res.json();
      } catch {}
    }
    return null;
  }

  async function fetchDatamuse(word, rel) {
    const url = `https://api.datamuse.com/words?${rel}=${encodeURIComponent(word.toLowerCase())}&max=20`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d) => d.word).filter(Boolean);
  }

  function showPopup(rect, html) {
    removePopup();
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    setHtml(popup, html);
    document.body.appendChild(popup);
    positionPopup(popup, rect);
    popup.querySelector(".cd-close")?.addEventListener("click", removePopup);
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
        <button class="cd-close" aria-label="Close">×</button>
      </div>
      <div class="cd-body cd-loading">Looking up…</div>
    `;
  }

  function renderError(word, msg) {
    return `
      <div class="cd-header">
        ${renderBackBtn()}
        <span class="cd-word">${escapeHtml(word)}</span>
        <button class="cd-close" aria-label="Close">×</button>
      </div>
      <div class="cd-body cd-error">${escapeHtml(msg)}</div>
      <div class="cd-footer">
        <a class="cd-link" href="https://en.wiktionary.org/wiki/${encodeURIComponent(word)}" target="_blank" rel="noopener">Open in Wiktionary</a>
      </div>
    `;
  }

  function renderBackBtn() {
    if (!history.length) return "";
    return `<button class="cd-back" title="Back" aria-label="Back">←</button>`;
  }

  function renderContent() {
    const word = currentWord;
    const wikt = currentWiktionary;

    if (!wikt || wikt.error) {
      return renderError(word, wikt?.error || "No definition found.");
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
      const defs = entry.definitions || [];
      const limit = Math.max(1, Number(settings.maxShortDefs) || 2);
      const shown = expanded ? defs : defs.slice(0, limit);
      const items = shown.map((d) => {
        const text = stripHtml(d.definition);
        const showEx = (expanded || settings.showExamples) && d.examples?.length;
        const examples = showEx
          ? `<div class="cd-examples">${d.examples
              .map((ex) => `<div class="cd-example">${escapeHtml(stripHtml(ex))}</div>`)
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
        ${phonHtml}
        ${langPickerHtml}
        <button class="cd-close" aria-label="Close">×</button>
      </div>
      <div class="cd-body">
        ${synAntHtml}
        ${sections}
      </div>
      <div class="cd-footer">
        <button class="cd-expand">${expandLabel}</button>
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
      parts.push(`<button class="cd-audio" data-url="${escapeHtml(audio)}" title="Play pronunciation" aria-label="Play pronunciation">🔊</button>`);
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
    if (settings.showSynonyms && synonyms.size) {
      blocks.push(renderChipRow("Synonyms", [...synonyms].slice(0, limit)));
    }
    if (settings.showAntonyms && antonyms.size) {
      blocks.push(renderChipRow("Antonyms", [...antonyms].slice(0, limit)));
    }
    return blocks.join("");
  }

  function renderChipRow(label, items) {
    const chips = items.map((i) =>
      `<button class="cd-chip" data-word="${escapeHtml(i)}" title="Look up “${escapeHtml(i)}”">${escapeHtml(i)}</button>`
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
    return new DOMParser().parseFromString(s, "text/html").body.textContent || "";
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();

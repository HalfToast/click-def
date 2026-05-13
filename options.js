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
  autoResolveForms: false,
  preferredLanguage: "auto"
};

const FIELDS = Object.keys(DEFAULTS);

const api = (typeof browser !== "undefined" ? browser : chrome).storage.sync;

function load() {
  api.get(DEFAULTS).then((settings) => {
    for (const key of FIELDS) {
      const el = document.getElementById(key);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!settings[key];
      else el.value = settings[key];
    }
  });
}

function save() {
  const settings = {};
  for (const key of FIELDS) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === "checkbox") settings[key] = el.checked;
    else if (el.type === "number") settings[key] = Number(el.value) || DEFAULTS[key];
    else settings[key] = el.value;
  }
  api.set(settings).then(() => flash("Saved"));
}

function reset() {
  api.set(DEFAULTS).then(() => {
    load();
    flash("Reset to defaults");
  });
}

function flash(msg) {
  const status = document.getElementById("status");
  status.textContent = msg;
  status.classList.add("show");
  setTimeout(() => status.classList.remove("show"), 1500);
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", reset);
load();

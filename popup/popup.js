/* Voice Bubble — toolbar settings popup.
   Reads/writes the single `vb_settings` key in chrome.storage.local. The content
   script on each page listens for storage changes and applies them live. */
const $ = (id) => document.getElementById(id);

// Keep in sync with LANGS in content.js.
const LANGS = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"],
  ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"],
  ["it-IT", "Italian"], ["pt-BR", "Portuguese (BR)"], ["nl-NL", "Dutch"],
  ["pl-PL", "Polish"], ["ru-RU", "Russian"], ["uk-UA", "Ukrainian"],
  ["sv-SE", "Swedish"], ["tr-TR", "Turkish"], ["ar-SA", "Arabic"],
  ["hi-IN", "Hindi"], ["zh-CN", "Chinese"], ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"]
];

const DEFAULTS = { lang: "en-US", silenceMs: 3000,
                   insertMode: "append", enabled: true };
let settings = { ...DEFAULTS };

const langSel = $("lang"), silence = $("silence"), silVal = $("silVal"),
      modeSel = $("mode"), enabledSwitch = $("enabledSwitch"), opts = $("opts");

LANGS.forEach(([code, name]) => {
  const o = document.createElement("option");
  o.value = code; o.textContent = name; langSel.appendChild(o);
});

function render() {
  enabledSwitch.classList.toggle("on", settings.enabled);
  langSel.value = settings.lang;
  silence.value = settings.silenceMs / 1000;
  silVal.textContent = (settings.silenceMs / 1000).toFixed(1) + "s";
  modeSel.value = settings.insertMode;
  // The rest of the settings are meaningless while disabled.
  opts.classList.toggle("off-dim", !settings.enabled);
}

function save() { chrome.storage.local.set({ vb_settings: settings }); }
function update(patch) { settings = { ...settings, ...patch }; render(); save(); }

chrome.storage.local.get(["vb_settings"], (r) => {
  if (r.vb_settings) settings = { ...DEFAULTS, ...r.vb_settings };
  render();
});

enabledSwitch.addEventListener("click", () => update({ enabled: !settings.enabled }));
langSel.addEventListener("change", () => update({ lang: langSel.value }));
modeSel.addEventListener("change", () => update({ insertMode: modeSel.value }));
silence.addEventListener("input", () => {
  const ms = Math.round(parseFloat(silence.value) * 1000);
  silVal.textContent = (ms / 1000).toFixed(1) + "s";
  update({ silenceMs: ms });
});

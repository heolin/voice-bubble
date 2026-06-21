(() => {
  if (window.__voiceBubbleInjected) return;
  window.__voiceBubbleInjected = true;

  const ORIGIN = new URL(chrome.runtime.getURL("")).origin;
  const NONCE = Math.random().toString(36).slice(2);
  const MIC_ICON = chrome.runtime.getURL("icons/mic.png");

  const LANGS = [
    ["en-US", "English (US)"], ["en-GB", "English (UK)"],
    ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"],
    ["it-IT", "Italian"], ["pt-BR", "Portuguese (BR)"], ["nl-NL", "Dutch"],
    ["pl-PL", "Polish"], ["ru-RU", "Russian"], ["uk-UA", "Ukrainian"],
    ["sv-SE", "Swedish"], ["tr-TR", "Turkish"], ["ar-SA", "Arabic"],
    ["hi-IN", "Hindi"], ["zh-CN", "Chinese"], ["ja-JP", "Japanese"],
    ["ko-KR", "Korean"]
  ];

  let settings = { lang: "en-US", silenceMs: 3000, hidden: false, insertMode: "append",
                   enabled: true, pos: null };
  let currentTarget = null;     // the page field we'll type into
  let freshSession = false;     // first insertion of a recording session (for replace mode)
  let prevOutline = null;       // saved inline style to restore on the highlighted field
  let listening = false;
  let panelOpen = false;
  let recognizerReady = false;

  /* ---------- settings persistence ---------- */
  chrome.storage.local.get(["vb_settings"], (r) => {
    if (r.vb_settings) settings = { ...settings, ...r.vb_settings };
    applySettingsToUI();
    if (settings.hidden) host.style.display = "none";
    if (!settings.enabled) targetEl.textContent = "Voice input is off.";
    applyPosition();
  });
  function saveSettings() { chrome.storage.local.set({ vb_settings: settings }); }

  /* ---------- recognizer iframe (extension origin) ---------- */
  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("recognizer.html") + "#n=" + NONCE;
  iframe.allow = "microphone";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;width:1px;height:1px;border:0;left:-10000px;top:-10000px;opacity:0;";
  (document.body || document.documentElement).appendChild(iframe);

  function sendToRecognizer(type, payload = {}) {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ __vb: "content", nonce: NONCE, type, ...payload }, ORIGIN);
  }

  window.addEventListener("message", (e) => {
    if (e.source !== iframe.contentWindow) return;       // page can't forge this
    const d = e.data || {};
    if (d.__vb !== "recognizer" || d.nonce !== NONCE) return;
    switch (d.type) {
      case "ready":   recognizerReady = true; break;
      case "interim": showInterim(d.text); break;
      case "final":   insertText(currentTarget, d.text); showInterim(""); break;
      case "state":   setListening(d.listening); break;
      case "error":   handleError(d.error); break;
    }
  });

  // ========================================================================
  //  Bubble UI (shadow DOM, isolated from the page)
  // ========================================================================
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
  (document.body || document.documentElement).appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system,
           "Segoe UI", Roboto, sans-serif; }

      /* mic glyph, recolored per context via the mask's background-color */
      .ico { display: inline-block; flex: none;
        -webkit-mask: url("${MIC_ICON}") center / contain no-repeat;
        mask: url("${MIC_ICON}") center / contain no-repeat; }
      .fab .ico { width: 26px; height: 26px; background-color: #fff; }
      .mic .ico { width: 18px; height: 18px; background-color: #fff; }
      .fieldbtn.rec .ico { width: 14px; height: 14px; background-color: #fff; }

      /* draggable launcher */
      .fab {
        position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
        width: 56px; height: 56px; border-radius: 50%; cursor: grab;
        background: radial-gradient(circle at 50% 35%, #8fbcff 0%, #4a8df0 100%);
        color: #fff; display: grid; place-items: center;
        font-size: 24px; box-shadow: 0 8px 24px rgba(91,157,255,.35);
        border: 2px solid #dfecff; user-select: none; touch-action: none;
        transition: transform .12s ease, background .12s ease;
      }
      .fab:hover { transform: scale(1.05); }
      .fab:active { cursor: grabbing; }
      .fab.live { background: #e23b4e; animation: pulse 1.4s infinite; }
      @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(226,59,78,.5)}
        70%{box-shadow:0 0 0 14px rgba(226,59,78,0)} 100%{box-shadow:0 0 0 0 rgba(226,59,78,0)} }

      /* small buttons that attach to the focused field */
      .fieldbtn {
        position: fixed; display: none; place-items: center; padding: 0;
        width: 24px; height: 24px; border-radius: 50%; border: 0; cursor: pointer;
        font-size: 12px; line-height: 1; color: #fff;
        box-shadow: 0 2px 6px rgba(20,30,50,.3); user-select: none;
        z-index: 2147483647;
      }
      .fieldbtn.show { display: grid; }
      .fieldbtn.rec { background: #5b9dff; }
      .fieldbtn.rec:hover { background: #4a8df0; }
      .fieldbtn.rec.live { background: #e23b4e; animation: pulse 1.4s infinite; }
      .fieldbtn.clear { background: #f0a23b; font-size: 14px; }
      .fieldbtn.clear:hover { background: #db8d28; }
      .fieldbtn.close { background: #6b7280; }
      .fieldbtn.close:hover { background: #525a66; }

      .panel {
        position: fixed; z-index: 2147483647; width: 290px;
        background: #ffffff;
        color: #20223a; border: 0;
        border-radius: 16px; padding: 16px; box-shadow: 0 18px 50px rgba(20,22,58,.28);
        opacity: 0; transform: scale(.92) translateY(8px);
        pointer-events: none; transition: opacity .16s ease, transform .16s ease;
      }
      .panel.open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }

      .hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .title { font-size: 14px; font-weight: 700; flex: 1; }
      /* minimalist on/off switch in the header */
      .toggle { position: relative; flex: none; width: 34px; height: 18px; padding: 0; border: 0;
        border-radius: 999px; cursor: pointer; background: #cdd2e0; transition: background .15s; }
      .toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
        border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
      .toggle.on { background: #2f9d4e; }
      .toggle.on::after { transform: translateX(16px); }
      .x { cursor: pointer; color: #9aa0b4; font-size: 16px; line-height: 1; }
      .x:hover { color: #20223a; }

      .more { display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; margin-top: 10px; padding: 6px; background: none; border: 0;
        color: #9aa0b4; font-size: 11px; cursor: pointer; }
      .more:hover { color: #20223a; }
      .more-ico { font-size: 13px; }

      .target { font-size: 12px; color: #6b7088; background: #f4f5fb;
        border: 0; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .target b { color: #20223a; font-weight: 600; }

      .mic {
        width: 100%; padding: 12px; border: 0; border-radius: 12px; cursor: pointer;
        font-size: 15px; font-weight: 700; color: #fff; background: #5b9dff;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .mic:hover { background: #4a8df0; }
      .mic.live { background: #e23b4e; }
      .mic:disabled { opacity: .5; cursor: not-allowed; }

      .interim { min-height: 18px; margin-top: 9px; font-size: 13px;
        color: #6b7088; font-style: italic; }
      .interim:empty { min-height: 0; margin-top: 0; }
      .msg { margin-top: 8px; font-size: 12px; color: #d6455d; min-height: 0; }
      .msg:empty { margin-top: 0; }

      .extra { display: none; margin-top: 12px; padding-top: 12px;
        border-top: 1px solid #e2e4ee; }
      .extra.open { display: block; }
      label { display: block; font-size: 12px; color: #6b7088; margin: 10px 0 5px; }

      select, input[type=range] { width: 100%; }
      select { background: #fff; color: #20223a; border: 1px solid #e2e4ee;
        border-radius: 9px; padding: 8px 10px; font-size: 13px; }
      .rangeval { font-size: 12px; color: #20223a; float: right; }
    </style>

    <div class="fab" id="fab" title="Voice Bubble"><span class="ico"></span></div>

    <div class="panel" id="panel">
      <div class="hdr">
        <span class="title">Voice Bubble</span>
        <button class="toggle" id="toggle" title="Turn off"></button>
        <span class="x" id="close">✕</span>
      </div>
      <div class="basic">
        <div class="target" id="target">Click a text field to type into it.</div>
        <button class="mic" id="mic" disabled><span class="ico"></span> <span id="micLabel">Click a field first</span></button>
        <div class="interim" id="interim"></div>
        <div class="msg" id="msg"></div>
      </div>

      <button class="more" id="more"><span class="more-ico">⚙</span> more settings</button>

      <div class="extra" id="extra">
        <label>Language</label>
        <select id="lang"></select>
        <label>Auto-stop after silence
          <span class="rangeval" id="silVal">3.0s</span></label>
        <input type="range" id="silence" min="1" max="10" step="0.5" value="3">
        <label>When dictating</label>
        <select id="mode">
          <option value="append">Append to field</option>
          <option value="replace">Replace field</option>
        </select>
      </div>
    </div>

    <button class="fieldbtn rec" id="fieldRec" title="Start / stop recording"><span class="ico"></span></button>
    <button class="fieldbtn clear" id="fieldClear" title="Clear field">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>
    </button>
    <button class="fieldbtn close" id="fieldClose" title="Unselect field">✕</button>
  `;

  const $ = (id) => root.getElementById(id);
  const fab = $("fab"), panel = $("panel"), moreBtn = $("more"),
        extraBox = $("extra"), micBtn = $("mic"), micLabel = $("micLabel"),
        interimEl = $("interim"), msgEl = $("msg"), targetEl = $("target"),
        langSel = $("lang"), silence = $("silence"), silVal = $("silVal"),
        fieldRec = $("fieldRec"), fieldClose = $("fieldClose"),
        fieldClear = $("fieldClear"), modeSel = $("mode"),
        toggleBtn = $("toggle"), closeBtn = $("close");
  let suppressClick = false;     // set after a drag so the click doesn't toggle the panel

  LANGS.forEach(([code, name]) => {
    const o = document.createElement("option");
    o.value = code; o.textContent = name; langSel.appendChild(o);
  });

  function applySettingsToUI() {
    langSel.value = settings.lang;
    silence.value = settings.silenceMs / 1000;
    silVal.textContent = (settings.silenceMs / 1000).toFixed(1) + "s";
    modeSel.value = settings.insertMode;
    applyEnabledUI();
  }

  function applyEnabledUI() {
    toggleBtn.classList.toggle("on", settings.enabled);
    toggleBtn.title = settings.enabled ? "Turn off" : "Turn on";
    toggleBtn.setAttribute("aria-pressed", String(settings.enabled));
  }

  /* ---------- panel open / close + placement ---------- */
  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }
  function openPanel() {
    panelOpen = true;
    positionPanel();
    panel.classList.add("open");
  }
  function closePanel() {
    panelOpen = false;
    panel.classList.remove("open");
  }
  // Launcher in the top half → panel below it; bottom half → panel above it.
  function positionPanel() {
    const r = fab.getBoundingClientRect();
    const GAP = 12, pw = 290, ph = panel.offsetHeight || 360;
    const below = r.top + r.height / 2 < window.innerHeight / 2;
    let top = below ? r.bottom + GAP : r.top - ph - GAP;
    top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
    let left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  /* ---------- position persistence ---------- */
  function applyPosition() {
    if (!settings.pos) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 56, settings.pos.left));
    const ny = Math.max(0, Math.min(window.innerHeight - 56, settings.pos.top));
    fab.style.right = "auto"; fab.style.bottom = "auto";
    fab.style.left = nx + "px"; fab.style.top = ny + "px";
  }
  function savePosition() {
    const r = fab.getBoundingClientRect();
    settings.pos = { left: r.left, top: r.top };
    saveSettings();
  }

  /* ---------- interactions ---------- */
  closeBtn.addEventListener("click", closePanel);
  moreBtn.addEventListener("click", () => {
    const open = extraBox.classList.toggle("open");
    moreBtn.innerHTML = (open ? '<span class="more-ico">⚙</span> less settings'
                              : '<span class="more-ico">⚙</span> more settings');
    if (panelOpen) positionPanel();
  });

  langSel.addEventListener("change", () => {
    settings.lang = langSel.value; saveSettings();
    sendToRecognizer("config", { lang: settings.lang });
  });
  silence.addEventListener("input", () => {
    settings.silenceMs = Math.round(parseFloat(silence.value) * 1000);
    silVal.textContent = (settings.silenceMs / 1000).toFixed(1) + "s";
    saveSettings();
    sendToRecognizer("config", { silenceMs: settings.silenceMs });
  });
  modeSel.addEventListener("change", () => {
    settings.insertMode = modeSel.value; saveSettings();
  });
  // header on/off toggle drives voice input on/off (relocated from the old power button)
  toggleBtn.addEventListener("click", () => {
    settings.enabled = !settings.enabled; saveSettings();
    applyEnabledUI();
    if (!settings.enabled) {
      deselect();
      targetEl.textContent = "Voice input is off.";
    } else {
      targetEl.textContent = "Click a text field to type into it.";
    }
  });

  // Keep page focus on the target field while clicking bubble controls.
  [micBtn, moreBtn, toggleBtn].forEach((el) =>
    el.addEventListener("mousedown", (e) => e.preventDefault()));

  function toggleRecording() {
    if (!currentTarget) return;
    if (listening) {
      sendToRecognizer("stop");
    } else {
      msgEl.textContent = "";
      freshSession = true;   // replace mode overwrites on the first chunk
      sendToRecognizer("start", { lang: settings.lang, silenceMs: settings.silenceMs });
    }
  }
  micBtn.addEventListener("click", toggleRecording);

  /* ---------- launcher: drag to reposition, click to toggle the panel ---------- */
  (() => {
    let dragging = false, moved = false;
    let startX = 0, startY = 0, originX = 0, originY = 0;
    fab.addEventListener("pointerdown", (e) => {
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      const r = fab.getBoundingClientRect();
      originX = r.left; originY = r.top;
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        const x = Math.max(0, Math.min(window.innerWidth - 56, originX + dx));
        const y = Math.max(0, Math.min(window.innerHeight - 56, originY + dy));
        fab.style.right = "auto"; fab.style.bottom = "auto";
        fab.style.left = x + "px"; fab.style.top = y + "px";
        if (panelOpen) positionPanel();
      }
    });
    fab.addEventListener("pointerup", (e) => {
      dragging = false;
      try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) savePosition();
      else togglePanel();
    });
  })();

  /* ---------- small buttons attached to the focused field ---------- */
  // Keep page focus on the target field while clicking these.
  [fieldRec, fieldClear, fieldClose].forEach((el) =>
    el.addEventListener("mousedown", (e) => e.preventDefault()));
  fieldRec.addEventListener("click", toggleRecording);
  fieldClear.addEventListener("click", () => clearField(currentTarget));
  fieldClose.addEventListener("click", deselect);

  function showFieldButtons(on) {
    fieldRec.classList.toggle("show", on);
    fieldClear.classList.toggle("show", on);
    fieldClose.classList.toggle("show", on);
  }

  function positionFieldButtons() {
    if (!currentTarget) return;
    const r = currentTarget.getBoundingClientRect();
    // Field scrolled out of view → hide the buttons until it returns.
    const offscreen = r.bottom < 0 || r.top > window.innerHeight ||
                      r.right < 0 || r.left > window.innerWidth;
    showFieldButtons(!offscreen && !!currentTarget);
    if (offscreen) return;

    const SIZE = 24, INSET = 4, BTN_GAP = 6, m = 2;
    const top = Math.max(m, Math.min(window.innerHeight - SIZE - m,
                                     r.top + r.height / 2 - SIZE / 2));
    // Buttons sit inside the field's right edge: record, clear, then unselect.
    const closeLeft = Math.min(window.innerWidth - SIZE - m, r.right - SIZE - INSET);
    const clearLeft = Math.max(m, closeLeft - SIZE - BTN_GAP);
    const recLeft = Math.max(m, clearLeft - SIZE - BTN_GAP);
    fieldRec.style.top = top + "px";
    fieldRec.style.left = recLeft + "px";
    fieldClear.style.top = top + "px";
    fieldClear.style.left = clearLeft + "px";
    fieldClose.style.top = top + "px";
    fieldClose.style.left = closeLeft + "px";
  }

  // Follow the field as the page scrolls or resizes.
  window.addEventListener("scroll", positionFieldButtons, true);
  window.addEventListener("resize", () => { positionFieldButtons(); if (panelOpen) positionPanel(); });

  // ========================================================================
  //  Target field tracking + highlight
  // ========================================================================
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "email", "tel", "password", "number", ""].includes(t);
    }
    return false;
  }

  function applyHighlight(el) {
    prevOutline = { outline: el.style.outline, offset: el.style.outlineOffset };
    el.style.outline = "2px solid #dfecff";
    el.style.outlineOffset = "2px";
  }
  function clearHighlight() {
    if (currentTarget && prevOutline !== null) {
      currentTarget.style.outline = prevOutline.outline;
      currentTarget.style.outlineOffset = prevOutline.offset;
    }
    prevOutline = null;
  }

  function selectElement(el) {
    if (el === currentTarget) return;
    clearHighlight();
    currentTarget = el;
    applyHighlight(el);
    const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") ||
                  el.name || el.id || el.tagName.toLowerCase();
    targetEl.innerHTML = "Typing into: <b></b>";
    targetEl.querySelector("b").textContent = label;
    micBtn.disabled = false;
    micLabel.textContent = listening ? "Stop" : "Start talking";
    showFieldButtons(true);
    positionFieldButtons();
  }

  function deselect() {
    if (listening) sendToRecognizer("stop");
    clearHighlight();
    currentTarget = null;
    showFieldButtons(false);
    micBtn.disabled = true;
    micLabel.textContent = "Click a field first";
    targetEl.textContent = settings.enabled
      ? "Click a text field to type into it."
      : "Voice input is off.";
    showInterim("");
  }

  document.addEventListener("focusin", (e) => {
    if (!settings.enabled) return;
    const el = e.target;
    if (host.contains(el) || el === iframe) return;   // ignore our own UI
    if (isEditable(el)) selectElement(el);
  }, true);

  // Also catch clicks on fields that are already focused.
  document.addEventListener("click", (e) => {
    if (!settings.enabled) return;
    const el = e.target;
    if (host.contains(el)) return;
    if (isEditable(el)) selectElement(el);
  }, true);

  // ========================================================================
  //  Text I/O (works with React/controlled inputs)
  // ========================================================================
  function clearField(el) {
    if (!el) return;
    if (el.isContentEditable) {
      el.focus();
      const sel = window.getSelection();
      if (sel) { sel.selectAllChildren(el); }
      if (!document.execCommand("delete")) el.textContent = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      return;
    }
    const proto = el.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "");
    try { el.setSelectionRange(0, 0); } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertText(el, text) {
    if (!el || !text) return;

    // Replace mode: wipe the field before the first chunk of a session.
    if (settings.insertMode === "replace" && freshSession) {
      clearField(el);
      freshSession = false;
    }

    if (el.isContentEditable) {
      el.focus();
      const ok = document.execCommand("insertText", false, text + " ");
      if (!ok) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          sel.getRangeAt(0).insertNode(document.createTextNode(text + " "));
          sel.collapseToEnd();
        }
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      return;
    }

    const tag = el.tagName;
    const proto = tag === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    const start = el.selectionStart != null ? el.selectionStart : el.value.length;
    const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);

    let ins = text;
    if (before && !/\s$/.test(before)) ins = " " + ins;   // add a space between chunks
    const newVal = before + ins + after;

    setter.call(el, newVal);
    const caret = (before + ins).length;
    try { el.setSelectionRange(caret, caret); } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ---------- UI state helpers ---------- */
  function setListening(on) {
    listening = on;
    fab.classList.toggle("live", on);
    micBtn.classList.toggle("live", on);
    fieldRec.classList.toggle("live", on);
    micLabel.textContent = on ? "Stop" : (currentTarget ? "Start talking" : "Click a field first");
    if (!on) showInterim("");
  }
  function showInterim(text) { interimEl.textContent = text; }
  function handleError(code) {
    const map = {
      "not-allowed": "Microphone blocked. Open the extension's setup page and allow it.",
      "unsupported": "Speech recognition isn't available in this browser.",
      "network": "Network error — speech recognition needs an internet connection.",
    };
    msgEl.textContent = map[code] || ("Error: " + code);
    setListening(false);
  }

  /* ---------- toggle from toolbar icon (show / hide the whole bubble) ---------- */
  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.__vb === "toggle") {
      settings.hidden = !settings.hidden;
      host.style.display = settings.hidden ? "none" : "block";
      saveSettings();
    }
  });
})();

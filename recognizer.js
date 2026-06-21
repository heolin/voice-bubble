// Runs inside the hidden recognizer iframe (extension origin).
// Owns the SpeechRecognition session and the silence auto-stop timer.
// Talks to the content script via postMessage. A nonce (passed in the URL
// hash by the content script) prevents the host page from driving the mic.

(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const NONCE = params.get("n") || "";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let rec = null;
  let shouldListen = false;       // true while we intend to keep listening
  let lang = "en-US";
  let silenceMs = 3000;
  let silenceTimer = null;

  function post(type, payload = {}) {
    parent.postMessage({ __vb: "recognizer", nonce: NONCE, type, ...payload }, "*");
  }

  if (!SR) {
    post("error", { error: "unsupported" });
    return;
  }

  function clearSilence() {
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  }

  function resetSilence() {
    clearSilence();
    silenceTimer = setTimeout(() => {
      // No new speech for silenceMs → stop on our own terms.
      shouldListen = false;
      try { rec && rec.stop(); } catch (_) {}
    }, silenceMs);
  }

  function start() {
    try { if (rec) rec.abort(); } catch (_) {}
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    shouldListen = true;

    rec.onstart = () => { post("state", { listening: true }); resetSilence(); };

    rec.onresult = (e) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) post("interim", { text: interim });
      if (finalText) post("final", { text: finalText.trim() });
      resetSilence();
    };

    rec.onspeechstart = () => resetSilence();

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        shouldListen = false;
        post("error", { error: "not-allowed" });
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // benign — onend will handle restart/stop
      } else {
        post("error", { error: e.error || "unknown" });
      }
    };

    rec.onend = () => {
      if (shouldListen) {
        // Chrome sometimes ends a session spontaneously; resume seamlessly.
        try { rec.start(); } catch (_) {}
      } else {
        clearSilence();
        post("state", { listening: false });
      }
    };

    try { rec.start(); }
    catch (_) { /* start() throws if already started; ignore */ }
  }

  function userStop() {
    shouldListen = false;
    clearSilence();
    try { rec && rec.stop(); } catch (_) {}
  }

  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.__vb !== "content" || d.nonce !== NONCE) return;
    if (d.type === "start") {
      if (d.lang) lang = d.lang;
      if (d.silenceMs) silenceMs = d.silenceMs;
      start();
    } else if (d.type === "stop") {
      userStop();
    } else if (d.type === "config") {
      if (d.lang) lang = d.lang;
      if (d.silenceMs) silenceMs = d.silenceMs;
    }
  });

  post("ready");
})();

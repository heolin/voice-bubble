# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Voice Bubble is a Chrome Manifest V3 extension (vanilla JS, no build step, no
dependencies, no tests). It injects a floating mic bubble into every page that
types speech-to-text into whatever text field the user clicks. Load it via
`chrome://extensions` → "Load unpacked" → this directory. There is nothing to
build, install, or compile; editing a file and reloading the extension in
`chrome://extensions` is the full dev loop.

## Architecture: the iframe trust boundary

The central design decision is that microphone permission, once granted, must
work on **every** site without re-prompting. Chrome scopes mic permission per
origin, so the `SpeechRecognition` session is hosted in a hidden iframe served
from the **extension's own origin** rather than from the host page. The
permission is granted once (`permission.html`) against the extension origin and
reused everywhere.

This splits the code into two worlds that talk only via `postMessage`:

- **`content.js`** — injected into the page (`<all_urls>`, `document_idle`).
  Owns all UI (the bubble, rendered in a shadow DOM so page CSS can't touch it),
  tracks the target field, and inserts recognized text. Cannot access the mic
  itself.
- **`recognizer.js`** (loaded by `recognizer.html` inside the hidden iframe) —
  owns the `SpeechRecognition` object and the silence auto-stop timer. Has mic
  access by virtue of the extension origin. Has no DOM/page access.

`recognizer.html`/`recognizer.js` are listed in `web_accessible_resources` so
the page can frame them.

### Message protocol (keep both sides in sync)

All messages carry `__vb` and a `nonce`. The content script generates a random
nonce, passes it to the iframe via the URL hash (`recognizer.html#n=...`), and
both sides reject any message whose nonce doesn't match. This is the security
boundary: it stops the **host page** from driving the microphone or injecting
fake transcripts. When adding a message type, validate the nonce on receipt and
add the case on both ends.

- content → recognizer (`__vb: "content"`): `start` (with `lang`, `silenceMs`),
  `stop`, `config` (live-update `lang`/`silenceMs`).
- recognizer → content (`__vb: "recognizer"`): `ready`, `interim`, `final`,
  `state` (listening on/off), `error`.

The content script additionally checks `e.source === iframe.contentWindow` and
posts to the exact extension `ORIGIN` (not `*`); the recognizer posts to `*`
because the iframe doesn't know the host origin.

### background.js (service worker)

Thin. Opens `permission.html` once on install, and toggles bubble visibility on
the active tab when the toolbar icon is clicked (sends `{__vb: "toggle"}`;
catches the failure on pages with no content script, e.g. `chrome://`).

## Things that look wrong but are intentional

- **Continuous restart loop** (`recognizer.js` `onend`): Chrome ends recognition
  sessions spontaneously; while `shouldListen` is true the session is restarted
  seamlessly. Auto-stop is driven by the JS `silenceTimer`, not by Chrome's own
  end event.
- **`value` setter via prototype descriptor** (`content.js insertText`): writing
  through `Object.getOwnPropertyDescriptor(proto, "value").set` plus dispatching
  `input`/`change` is what makes typing work with React/controlled inputs, which
  ignore direct `el.value =` assignment. `contentEditable` fields use a separate
  `execCommand("insertText")` path.
- **`mousedown` preventDefault on bubble controls**: keeps page focus on the
  target field so the caret/selection survives clicking the mic button.

## Conventions

- Settings persist to `chrome.storage.local` under the single key `vb_settings`
  (`{ lang, silenceMs, hidden }`).
- The supported-language list (`LANGS`) lives in `content.js`; codes are passed
  straight through to `SpeechRecognition.lang`.
- Bump `version` in `manifest.json` for any release.

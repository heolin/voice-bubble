# Privacy Policy — Voice Bubble

_Last updated: 2026-06-21_

Voice Bubble is a Chrome extension that lets you dictate text by voice into any
text field in your browser. This policy explains exactly what it does and does
not do with your data.

## The short version

Voice Bubble has **no accounts, no analytics, no tracking, and no servers of its
own**. It does not collect, sell, or share your personal information. The only
data it stores is kept **locally in your browser**.

## What is stored locally

The extension saves the following to your browser's local storage
(`chrome.storage.local`) so your preferences persist between sessions:

- your chosen recognition **language**;
- the **auto-stop silence** timeout;
- the **insert mode** (append or replace);
- whether voice input is **on or off**;
- the **position** of the floating bubble.

This data never leaves your device and is removed if you uninstall the extension.

## Microphone and speech recognition

When you start dictation, Voice Bubble captures audio from your microphone and
passes it to your browser's **built-in Web Speech API** to convert speech to
text. To perform that conversion, the browser sends the audio to its speech
recognition service (in Chrome, this is provided by Google) — the same service
any website's voice input uses.

- Audio is used **only** for live transcription while you are dictating.
- Voice Bubble does **not** record, store, or transmit your audio to its
  developer, and adds no processing on top of the browser's own speech service.
- Transcription is governed by your browser vendor's privacy policy. For Chrome,
  see Google's Privacy Policy: https://policies.google.com/privacy

## Permissions, and why they are needed

- **Storage** — to save the local settings listed above.
- **Access to all websites** — so the mic bubble can appear in text fields on any
  site you choose to dictate into, and insert the recognized text there.
- **Microphone** (requested at runtime) — to capture your speech for
  transcription.

## Children

Voice Bubble is a general-purpose utility and is not directed at children.

## Changes

If this policy changes, the updated version will be published in this repository
with a new "Last updated" date.

## Contact

Questions? Contact the developer at **wlodarczyk.woj@gmail.com** or open an issue
at https://github.com/heolin/voice-bubble/issues

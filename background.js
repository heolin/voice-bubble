// Open the one-time microphone permission page when the extension is installed.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
  }
});

// Clicking the toolbar icon opens the settings popup (manifest `default_popup`).
// Show/hide of the bubble now lives in that popup, applied live via storage.

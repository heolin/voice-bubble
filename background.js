// Open the one-time microphone permission page when the extension is installed.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
  }
});

// Clicking the toolbar icon toggles the bubble on the active tab.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { __vb: "toggle" }).catch(() => {
    // Content script not present on this page (e.g. chrome:// pages) — ignore.
  });
});

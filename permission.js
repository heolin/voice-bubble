const btn = document.getElementById("grant");
const statusEl = document.getElementById("status");

btn.addEventListener("click", async () => {
  statusEl.textContent = "";
  statusEl.className = "status";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We only needed the permission, not the audio — release the device.
    stream.getTracks().forEach((t) => t.stop());
    statusEl.textContent = "✓ Microphone enabled. You can close this tab and start using Voice Bubble.";
    statusEl.className = "status ok";
    btn.disabled = true;
    btn.style.opacity = ".6";
  } catch (err) {
    statusEl.textContent =
      "Couldn't get microphone access (" + (err.name || "error") +
      "). Click the camera/mic icon in the address bar and allow it, then try again.";
    statusEl.className = "status err";
  }
});

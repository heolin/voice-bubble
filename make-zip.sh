#!/usr/bin/env bash
# Build a Chrome Web Store-ready zip containing only the runtime files
# (manifest must sit at the zip root). Excludes docs/, README, git, and dev cruft.
set -euo pipefail
cd "$(dirname "$0")"

ver=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' manifest.json | grep -oE '[0-9][0-9.]*' | head -1)
mkdir -p dist
out="dist/voice-bubble-${ver}.zip"
rm -f "$out"

zip -r "$out" \
  manifest.json \
  content.js \
  background.js \
  recognizer.html recognizer.js \
  permission.html permission.js \
  popup \
  icons \
  -x '*/.DS_Store' >/dev/null

echo "Built $out"
unzip -l "$out"

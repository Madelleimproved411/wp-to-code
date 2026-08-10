#!/usr/bin/env bash
# Installs the plugin's node dependencies into ${CLAUDE_PLUGIN_DATA}, which survives
# plugin updates. Reinstalls only when the bundled package.json differs from the
# copy in the data directory, so a normal session start costs one diff.
set -euo pipefail

SRC="${CLAUDE_PLUGIN_ROOT}/scripts/package.json"
DEST="${CLAUDE_PLUGIN_DATA}"

mkdir -p "$DEST"

if diff -q "$SRC" "$DEST/package.json" >/dev/null 2>&1; then
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "wp-to-code: npm not found. Install Node 18+ to use the measurement commands." >&2
  exit 0
fi

cp "$SRC" "$DEST/package.json"

if (cd "$DEST" && npm install --silent --no-audit --no-fund >/dev/null 2>&1); then
  echo "wp-to-code: dependencies installed."
else
  # Leave no stale manifest behind, so the next session retries the install.
  rm -f "$DEST/package.json"
  echo "wp-to-code: npm install failed. Measurement commands will not run until it succeeds." >&2
fi

#!/usr/bin/env bash
# Installs the plugin's node dependencies into ${CLAUDE_PLUGIN_DATA}, which survives
# plugin updates. Reinstalls only when the bundled package.json differs from the
# copy in the data directory, so a normal session start costs one diff.
set -euo pipefail

SRC="${CLAUDE_PLUGIN_ROOT}/scripts/package.json"
DEST="${CLAUDE_PLUGIN_DATA}"

mkdir -p "$DEST"

# Point the scripts directory at the installed modules so `node script.mjs`
# resolves them without every caller having to set NODE_PATH. Recreated each
# session, because CLAUDE_PLUGIN_ROOT moves when the plugin updates.
# Skipped when a real node_modules is already there: that means someone ran
# npm install in the scripts directory to work on the plugin, and `ln -sfn`
# would drop the link *inside* that directory rather than replacing it.
link_modules() {
  local target="${CLAUDE_PLUGIN_ROOT}/scripts/node_modules"
  if [ -d "$target" ] && [ ! -L "$target" ]; then
    return
  fi
  ln -sfn "$DEST/node_modules" "$target" 2>/dev/null || true
}

if diff -q "$SRC" "$DEST/package.json" >/dev/null 2>&1; then
  link_modules
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "wp-to-code: npm not found. Install Node 18+ to use the measurement commands." >&2
  exit 0
fi

cp "$SRC" "$DEST/package.json"

if (cd "$DEST" && npm install --silent --no-audit --no-fund >/dev/null 2>&1); then
  link_modules
  echo "wp-to-code: dependencies installed."
else
  # Leave no stale manifest behind, so the next session retries the install.
  rm -f "$DEST/package.json"
  echo "wp-to-code: npm install failed. Measurement commands will not run until it succeeds." >&2
fi

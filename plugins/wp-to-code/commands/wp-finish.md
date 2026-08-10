---
description: Verify every page at every viewport, then delete the mirror and the measurement dumps.
allowed-tools: Bash, Read, Edit
---

## 1. Verify before deleting anything

For every page in the config, at every viewport:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/diff.mjs" --page <slug> --json
node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs"
```

Both must be clean. If anything is off, stop and report it. Deleting the mirror is the one irreversible step in this workflow: once it is gone, re-mirroring gets whatever the live site looks like that day, which may no longer be what you ported.

## 2. Report first, then ask

Show the user the full table across pages and viewports, plus the audit result and the size of what is about to be deleted. Ask before deleting. Do not treat a green diff as permission.

## 3. Delete

```bash
rm -rf .wp-to-code/
```

That removes the mirror, the measurement dumps, the diff reports and the config. Also remove:

- the mirror server from any process manager or npm script
- `.wp-to-code/` from `.gitignore`, now that nothing writes there
- any temporary route that served the original, if the stack needed one

Commit it in one go, after the last page matches.

On the source project this was about 8MB. The mirror is worth keeping until the last page is verified and not one day longer, because everything in it points at a site you no longer control.

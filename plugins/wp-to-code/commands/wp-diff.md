---
description: Compare a ported page against the mirrored original, section by section, on height and position.
argument-hint: <page-slug> [--viewport 1440,768,390]
allowed-tools: Bash, Read
---

Run the diff gate for the page the user named: `$ARGUMENTS`.

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/diff.mjs" --page <slug> [--viewport 1440,768,390]
```

Before running, confirm both sides are actually being served:

- The mirror server on the port in `.wp-to-code/config.json` (`mirror.port`). Start it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs"` if it is not up.
- The project's own dev server on `port.devUrl`.

A connection error against one of those two URLs is the most common cause of a failed run, so check that before touching any markup.

## Reading the output

```
1440px
   #           height              top   verdict   section
   0     839 vs    838       0 vs      0   MATCH     header
   1     267 vs    267     839 vs    838   MATCH     section.stats
   2     612 vs    612    1106 vs   1206   Δtop +100 section.mission
```

- `Δh` means the section is the wrong height. Work inside it.
- `Δtop` with `Δh` absent means the section is the right size and in the wrong place. Something above it moved, or a margin collapsed out of it. Check the first section above with a delta, and check for a negative margin on an inner element that has escaped its parent. `flow-root` on the container is the usual fix.
- `clientWidth differs` means the two pages are laying out at different widths, usually a scrollbar. Nothing below that line is comparable until it matches.
- `section count` mismatch means the structure diverged. Fix that before reading any number.

## What to do next

Work top down: the first section with a delta often explains every delta below it. Fix one section, run the diff again. Two to four rounds per page is normal.

Do not round measured values to the framework's spacing scale. Use the measured number as an arbitrary value.

When every section matches, say so with the table. Never report a page as done without a diff run behind it, and never report it on height alone.

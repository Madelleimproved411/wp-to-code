---
description: Extract design tokens from the original's computed styles and write them into the target's token file.
argument-hint: "[--page <slug>]"
allowed-tools: Bash, Read, Write, Edit
---

Run the token census: `$ARGUMENTS`.

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/theme.mjs"
```

Reads computed styles across every mirrored page, not the stylesheets. Builder CSS is generated and unreadable, and the browser has already resolved it.

For a Gutenberg site, read `theme.json` from the source instead. It is already a token file.

## Naming

**Type tokens are named by pixel value.** `--text-23: 23px`. When a measurement reads `23px/27.6px` you write `text-23 leading-[27.6px]` with no arithmetic in between, and the name cannot drift from what it means.

**Enumerate every size before writing any markup.** A token used but never defined emits nothing, the element silently inherits, and section heights can stay correct while the text renders at half size. The census output is the complete list; put all of it in the token file even if some sizes appear once.

Colours and font families come out numbered with usage counts. Name them yourself. The most-used family is usually body text and the rarest is usually the display face, but that is a judgement about the design, and a counter cannot make it.

## Breakpoints

The census separates real boundaries from noise. A real breakpoint shows up as an adjacent pair: a rule at `max-width: 767px` and its counterpart at `min-width: 768px`. Isolated widths are plugin defaults and are not part of this site's design.

Put the real boundaries in the config's `viewports` so `/wp-diff` checks each one. A section that matches at 1440 and collapses at 390 is the most common way a port ships broken.

## Line heights

The `size/line-height` table is the useful half of the output. Any pair ending `/normal` is unresolved: that element inherits roughly 1.5em and the design almost certainly wants less. Resolve each one against the original before using it.

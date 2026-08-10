---
description: Dump the layout tree, section list, content or interactive inventory for a page to a file.
argument-hint: "<page-slug> [--side original|port] [--mode tree|sections|content|interactive]"
allowed-tools: Bash, Read, Grep
---

Measure the page the user named: `$ARGUMENTS`.

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" \
  --page <slug> --side original --mode tree [--viewport 1440]
```

## Modes

| Mode          | Use it for                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| `sections`    | First look at a page. Top-level blocks with height, top, padding, background.               |
| `tree`        | Writing a section. Every element with text or an image, with rect, font, margin, padding.   |
| `content`     | Text, image URLs, hrefs, alt text. Nothing about geometry.                                  |
| `interactive` | Inventory of sliders, menus, accordions, forms and video that need behaviour reimplemented. |

Run `sections` first. Only run `tree` for the section you are about to write.

## Context discipline

The dump goes to a file under `.wp-to-code/measure/`. The command prints a summary; that summary is usually all you need.

**Never read a whole tree dump into the conversation.** A 3000px section is tens of thousands of tokens and it will stall the session. Query the file instead:

```bash
# every element inside one section, height and font only
jq '.nodes[] | select(.path | startswith("section:nth-child(4)"))
    | {path, text, h: .rect.height, size: .font.size, lh: .font.lineHeight}' \
  .wp-to-code/measure/home-original-1440-tree.json

# what line-heights are actually in use
jq -r '.nodes[].font | "\(.size)/\(.lineHeight)"' <file> | sort -u
```

Print only what you are about to act on.

## Reading geometry

Take line-height from the measurement, never from a named token. A `lineHeight: "normal"` in the dump resolves to roughly 1.5x the font size, and designs rarely want that. Every `normal` in the summary is a value you need to check against the original rather than inherit.

Take spacing from the measurement too. Elementor paragraphs carry a hidden bottom margin on top of the widget's own, so a text block that measures 62px around a 48px paragraph is not missing 14px of padding, it already has it.

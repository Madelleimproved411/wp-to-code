---
description: Static check for the porting failures that stay silent, including undefined tokens and interpolated class names.
allowed-tools: Bash, Read, Edit
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs"
```

Run this **before trusting any measurement pass**, and again before calling a page done.

## What it catches, and why each one hides

**Undefined tokens.** `text-28` used, `--text-28` never defined. Tailwind emits nothing, the element inherits its parent's size, and if the block is absolutely positioned every section height stays correct. On the port this plugin came from, that shipped at half size across four pages and survived a full geometry pass.

**Interpolated class names.** Tailwind's scanner reads source text, so `pl-[${x}px]` is a string it cannot resolve, not a class. No CSS is generated and no error is raised. Use an inline style for genuinely dynamic values.

**`leading-normal` on text over 18px.** Renders at 1.5x. The original is usually tighter. Take line-height from the measurement.

**Horizontal padding on a fixed-width box.** `w-[287px] pl-[15px]` is a 272px content box. Text rewraps and the height changes with nothing in the class list to explain it.

**Arbitrary values that duplicate a token.** `text-[24px]` where `--text-23` exists. Usually a measurement that was not reconciled.

The last section counts single-use classes. A high proportion suggests two sections that should be one component.

Exit code is non-zero when there are findings, so this works as a gate in a script.

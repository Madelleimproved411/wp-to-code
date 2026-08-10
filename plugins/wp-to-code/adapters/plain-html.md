# Adapter: plain HTML and CSS

| | |
| --- | --- |
| Page file | `<slug>.html` at the project root, or `dist/<slug>.html` |
| Class attribute | `class` |
| Global CSS | `styles.css`, or the Tailwind output file |
| Dev server | `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" --dir . --port 5500` |

There is no component model here. That changes the workflow more than it changes the markup.

## What "componentise" means without components

Nothing, at first. Write each page out in full. Duplication across pages is fine and it is honest: a repeated block is a repeated block.

When a block appears on a third page and you are still editing it, that is the point to introduce one of:

- **Server includes**, if the host supports SSI.
- **A build step.** Eleventy or Astro give you includes without giving up static output. If the user is willing, moving to Astro at this point is less work than maintaining the duplication.
- **A `<template>` element plus a few lines of JS**, if the block is genuinely data-driven. This costs you the no-JS property, so only for something that earns it.

Do not invent a build step before there is duplication to justify it.

## Tailwind without a bundler

The standalone CLI needs no Node project:

```bash
npx @tailwindcss/cli -i src/input.css -o styles.css --watch
```

The scanner still reads source text, so `class="pl-[15px]"` works and any interpolated class does not.

## If the styling mode is passthrough

The port is the mirrored HTML with its `<head>` links pointed at local copies of the CSS. That is a legitimate outcome and `/wp-diff` should show zero deltas immediately.

Be straight with the user about what they have: a static copy of the site, not a codebase. The Elementor class names and wrapper divs are load-bearing, because the CSS is scoped to them, so editing it later means editing generated markup. If they want something maintainable, the answer is `tailwind` mode, and it is a different amount of work.

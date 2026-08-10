---
description: Write the components for a page from its measurements, in the target stack's idiom.
argument-hint: "<page-slug> [section-index]"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

Port the page the user named: `$ARGUMENTS`.

**Read the `porting-gotchas` skill first.** It lists the failures that pass a height check, and reading it after writing the markup is worth much less than reading it before.

Then read the adapter for the stack in `target.stack`: `${CLAUDE_PLUGIN_ROOT}/adapters/<stack>.md`. Only `laravel-blade`, `next-app`, `astro` and `plain-html` have one. For any other stack read `${CLAUDE_PLUGIN_ROOT}/adapters/_generic.md`, which tells you what to work out from the project itself.

## Order

1. **See the page.** `/wp-measure <page> --mode sections`. This tells you how many sections there are and which of them you have already built for another page.

2. **Check for reuse before writing anything new.** Look at what already exists in `target.componentDir`. On the source project, reuse ran high after the first two pages: services needed 1 new section of 5, events 1 of 7, about-us 2 of 8, team 0 of 4. If a section is the same block with different content, it is a prop, not a new component.

3. **Measure the one section you are about to write.** `/wp-measure <page> --mode tree`, then query the dump for that section's subtree. Do not read the whole file into the conversation.

4. **Get the content separately.** `--mode content`, or the REST API if `source.restApi` is true. Mixing content and geometry in one pass produces output too large to read.

5. **Write it.** Measured numbers as arbitrary values. No rounding to the spacing scale.

6. **`/wp-diff <page>`.** Fix the first section with a delta, run again. Two to four rounds is normal.

## Component shape

Props are flat and string-keyed, matching what a CMS repeater returns, so wiring the CMS later is passing data through rather than reshaping it.

Variation between pages is a prop: padding, container width, row height. Pass literal class strings. Never build a class name by interpolation, in any stack, for any reason: the Tailwind scanner reads source text and an interpolated name produces no CSS and no error.

Name components for what they contain, not where they first appeared. `event-list`, not `home-section-4`.

## Finishing a page

Run `/wp-audit`, then `/wp-diff` at every viewport in the config. Report the table. Do not describe a page as done on a single-viewport height check.

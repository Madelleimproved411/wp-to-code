---
description: Download the original site to a local directory that can be served flat, and find each page's section root.
argument-hint: "[page-slug] [--render] [--no-sweep]"
allowed-tools: Bash, Read, Edit, Grep
---

Mirror the source site: `$ARGUMENTS`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/mirror.mjs" [--page <slug>] [--render] [--no-sweep]
```

What it does: downloads CSS, JS and fonts preserving path structure, follows stylesheets into their own dependencies, scans downloaded JS for bundles loaded lazily at runtime, then loads each page in a browser and picks up anything the mirror could not serve. Images and video stay remote on purpose; they are most of the bytes and the CMS owns them later.

Only paths actually downloaded get rewritten, in all four encodings the same URL appears in, so nothing quietly keeps pointing at the live site. If the original goes away, the mirror still works.

Use `--render` if the mirrored page comes back nearly empty. That means the site renders its content client-side and the raw HTML is a shell.

## After mirroring: find the section root

The diff compares the direct children of one selector on each side. For a builder that scopes CSS per post, a page contains several roots (header, footer, content) and you want the content one.

```bash
grep -oE 'elementor-[0-9]+' .wp-to-code/mirror/home.html | sort | uniq -c | sort -rn
```

Then check each candidate:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" &
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" --page home --mode sections --root ".elementor-42"
```

The right root is the one with the page's real sections, not two. Write it into `pages[].originalRoot` in the config.

Other builders: `#et-boc .et_builder_inner_content` (Divi), `.fl-builder-content` (Beaver Builder), `.brx-content` (Bricks), `.wp-site-blocks` (Gutenberg), `.entry-content` or `main` for a hand-coded theme.

Repeat per page. Roots differ between pages.

## Serving it

The mirror is a plain directory on a fixed port with no framework in front of it. That is deliberate: it means the thing you are building can be any stack, on any other port, with no shared origin and no CORS problem.

Leave `serve.mjs` running for the whole port. `/wp-diff` needs it.

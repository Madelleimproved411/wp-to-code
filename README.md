# wp-to-code

A Claude Code plugin for porting a WordPress site to another stack by measuring the original, not by looking at it.

```
/plugin marketplace add Abdulkader-Safi/wp-to-code
/plugin install wp-to-code@wp-to-code
```

## The idea

Rebuilding a design by eye gets you to about 90% and stops there, with nobody able to say what is wrong. Comparing `getBoundingClientRect()` between the original and your port gets you inside a pixel and tells you exactly which block is off and by how much.

Everything in this plugin exists to make that comparison cheap:

```
/wp-init https://oldsite.com     detect the builder and your stack, write the config
/wp-mirror                       download the original, serve it flat on a fixed port
/wp-theme                        design tokens from computed styles
/wp-measure home                 what a page is actually made of
/wp-port home                    write the components
/wp-diff home                    the gate
/wp-audit                        the failures that stay silent
/wp-finish                       verify everything, then delete the mirror
```

`/wp-diff` is the one that makes the rest work:

```
1440px
   #           height              top   verdict   section
   0     839 vs    838       0 vs      0   MATCH     header
   1     267 vs    267     839 vs    838   MATCH     section.stats
   2     612 vs    612    1106 vs   1206   Δtop +100 section.mission
```

It compares position as well as height, because a section can be the right height and in the wrong place. That is how a collapsed margin drags a background image 100px up the page while every height check passes.

## Any source, any target

The mirror reads HTTP responses and the measurement reads rendered DOM. Neither has an opinion about how the HTML was produced, so Elementor, Divi, Bricks, WPBakery, Gutenberg and hand-coded themes all go through the same loop. Gutenberg is the easiest: `theme.json` is already a token file.

Targets ship as short adapter files describing where components go and what the syntax is: Laravel Blade, Next.js App Router, Astro, and plain HTML. Adding one is about forty lines.

Styling is either `tailwind`, which rebuilds from measured values, or `passthrough`, which keeps the original CSS. Read `adapters/plain-html.md` before choosing passthrough; on Elementor it means keeping the original wrapper markup too, because the CSS is scoped per post ID.

## Requirements

Node 18+ and Google Chrome. The plugin uses your installed Chrome through `playwright-core`, so there is no browser download. Dependencies install on first session into the plugin's data directory.

## Development

```bash
cd plugins/wp-to-code/scripts
npm install
node selfcheck.mjs          # end-to-end check of the diff gate
claude plugin validate ../ --strict
```

`selfcheck.mjs` serves two fixture pages and asserts that the gate catches a position-only regression a height check would pass.

## Background

The process came out of porting a ten-page Elementor site to Laravel 13 and Tailwind 4, where nine of ten pages matched the original to the pixel. `research.md` has the full write-up: what generalises, what does not, and the list of things that silently go wrong.

MIT.

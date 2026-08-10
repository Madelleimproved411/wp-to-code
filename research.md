# wp-to-code: research

What it takes to turn the Laravel + Tailwind porting process into a Claude Code plugin that works against any target stack.

Source material: the forwarddsrpt.goonline.au port (Elementor → Laravel 13 + Tailwind 4, 10 pages, ~26 components).

---

## 1. What actually generalises

The original process had four moving parts. Only one of them is Laravel-specific.

| Part                               | Laravel-specific?          | Notes                                                                                              |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| Mirror the original site           | No                         | curl + asset walk + URL rewrite. Pure shell.                                                       |
| Serve the mirror next to the port  | Yes, but only accidentally | Solved with a Blade route. A static file server on a fixed port does the same job for every stack. |
| Measure and diff rendered geometry | No                         | `getBoundingClientRect()` in a browser. Framework has no opinion.                                  |
| Write the components               | Yes                        | The only place the stack matters.                                                                  |

So the plugin is a **measurement harness plus a thin adapter per stack**. The harness is 80% of the code and 100% of the value. The adapter is a 40-line markdown file telling the model where files go and what the component syntax looks like. Do not write a code generator per framework.

### The same-origin iframe trick should be dropped

The iframe in Phase 3 existed because `/_original/home` and `/` sat on the same origin, so `f.contentDocument` was readable. That constraint forced the mirror into the Laravel app.

Driving a browser over CDP removes it. Open two pages, measure each, compare in Node. The mirror can be a `python -m http.server` on port 4321 and the port can be Next on 3000. No CORS, no route to delete later, no framework coupling.

This one change is what makes the whole thing multi-stack.

---

## 2. The axes of variation

### Target stack

| Stack                 | Component file                           | Class attribute | Notes                                                                      |
| --------------------- | ---------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| Plain HTML + CSS      | `.html` partials or nothing              | `class`         | Simplest. No component model, so "componentise" means includes or nothing. |
| Laravel Blade         | `resources/views/components/*.blade.php` | `class`         | The proven path. Props are attributes.                                     |
| Next.js App Router    | `components/sections/*.tsx`              | `className`     | Routes are `app/<slug>/page.tsx`. Server components by default.            |
| React + Vite          | `src/sections/*.tsx`                     | `className`     | Router is the user's choice. Ask.                                          |
| Astro                 | `src/components/*.astro`                 | `class`         | Closest to the HTML original. Good default for marketing sites.            |
| Vue / Nuxt            | `components/*.vue`                       | `class`         |                                                                            |
| Svelte / SvelteKit    | `src/lib/components/*.svelte`            | `class`         |                                                                            |
| WordPress block theme | `parts/*.html` + `theme.json`            | `class`         | Worth having. Some clients want to stay on WP but leave Elementor.         |

The adapter needs to state exactly six things:

1. Component file path pattern and extension
2. Component declaration syntax (props in, props out)
3. Class attribute name
4. Loop and conditional syntax
5. How a page/route is registered
6. Where global CSS lives

Everything else the model already knows.

### Styling mode

Three real modes, not a spectrum.

**`passthrough`** — keep the WordPress CSS files verbatim, keep the class names, restructure only the HTML into components.

- Fastest by a wide margin. Diff should be near zero on the first run.
- Real limitation: Elementor scopes CSS per post ID (`.elementor-42 .elementor-element-a1b2c3`). If you rename or restructure wrappers, the rules stop matching. Passthrough in practice means wrapping the original markup, not componentising it. Say this out loud in the docs so people do not pick it and then get stuck.
- Good for: "get off WordPress this week, keep the look, we will restyle later."

**`prune`** — passthrough plus a coverage pass. Load every page with CDP's `CSS.startRuleUsageTracking`, collect used rules, drop the rest. Elementor commonly ships 300 to 500KB of CSS for a page that uses six widgets.

- Cheap to add once the browser layer exists. Same fidelity as passthrough, much smaller output.
- Watch: rules that only apply on hover, focus, or at other breakpoints will look unused. Run coverage at every viewport and simulate `:hover` on interactive elements, or keep any rule whose selector contains a pseudo-class.

**`tailwind`** — the original process. Extract tokens from computed styles, write markup with measured arbitrary values, iterate against the diff gate.

- Slowest, cleanest result, needs the full loop.
- Tailwind v4 (`@theme` in CSS) and v3 (`tailwind.config.js`) need different token output. Detect from the installed version, do not ask.

**`extract-css`** (hand-named plain CSS or CSS modules) is a fourth option people will ask for. It is the hardest and the least valuable: you are inventing a naming system that no tool can verify. Put it behind a "not in v1" note.

### Page builder on the source side

Not every WordPress site is Elementor. The mirror and measure steps are identical, but the section-boundary selectors, CSS scoping and JS behaviours differ. Detection is a grep over the mirrored HTML.

| Builder                 | Detect by                                      | Section root                                         | Scoping quirk                                                 |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Elementor               | `.elementor-page`, `elementor-frontend.min.js` | `.elementor-<postid> > .e-con, > .elementor-section` | Per-post-ID CSS in `uploads/elementor/css/post-42.css`        |
| Divi                    | `#et-boc`, `.et_pb_section`                    | `.et_pb_section`                                     | Per-post CSS in `et-core-unified-*.css`                       |
| WPBakery                | `.vc_row`, `js_composer.min.css`               | `.vc_row`                                            | Inline `<style>` per shortcode                                |
| Beaver Builder          | `.fl-builder-content`, `.fl-row`               | `.fl-row`                                            | Per-post CSS in `uploads/bb-plugin/cache/`                    |
| Bricks                  | `.brxe-` prefixed classes                      | `.brxe-section`                                      | Global CSS + per-element ID rules                             |
| Gutenberg / block theme | `.wp-block-*`, `theme.json`                    | `.wp-block-group` at top level                       | `theme.json` is a design token file already, read it directly |
| Oxygen                  | `.ct-section`                                  | `.ct-section`                                        | Single generated stylesheet                                   |

Gutenberg is the easy case and worth a special path: `theme.json` already contains the palette, type scale and spacing scale. `/wp-theme` should read it instead of sampling computed styles.

### What is actually builder-specific

Almost nothing. The mirror reads HTTP responses and the measure reads rendered DOM, so neither has any opinion about how the HTML was produced. A hand-coded theme from 2014 goes through the identical loop.

Only three things in the plan are Elementor-shaped, and two of them have a better generic replacement:

**Section boundary selectors.** The diff needs to know what counts as a top-level section. This is the one real per-builder difference and it is already a config field (`originalRoot`), one line per site. On a hand-coded theme with no consistent wrapper, you set it by hand once and the rest of the loop works.

**The webpack chunk map hack.** Extracting `__webpack_require__.u` from `webpack.runtime.min.js` only exists in Elementor. Replace it with something builder-agnostic: after the curl pass, load every page in the browser, interact with anything that looks interactive, record every network request, and download whatever is not already mirrored. This catches more than the chunk map did and needs no per-builder knowledge.

**The Elementor gotchas.** The 14.4px paragraph margin and `.elementor-invisible` are specific. Every builder has its own equivalents. Generalise the fix rather than cataloguing them: kill all animation globally, and take every spacing value from a measurement rather than a class name.

```css
*,
*::before,
*::after {
  animation: none !important;
  transition: none !important;
}
.elementor-invisible,
.et_animated,
.fl-animated,
.animated,
[data-aos] {
  opacity: 1 !important;
  transform: none !important;
  visibility: visible !important;
}
```

### Difficulty by builder

| Builder                  | Difficulty                       | Why                                                                                                              |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Gutenberg / block theme  | Easiest                          | `theme.json` is a token file already. No generated per-post CSS. Semantic block classes.                         |
| Bricks                   | Easy                             | Modern, small CSS. Clean `.brxe-section` boundary.                                                               |
| Hand-coded classic theme | Easy to measure, fiddly to bound | Usually clean CSS, but section wrappers are inconsistent. Set `originalRoot` by hand.                            |
| Divi                     | Moderate                         | Clean `.et_pb_section` boundary, but per-post generated CSS and heavy jQuery behaviour, same shape as Elementor. |
| Beaver Builder           | Moderate                         | Same pattern: `.fl-row` boundary, cached per-post CSS.                                                           |
| Elementor                | Moderate                         | The proven path. Most known gotchas, because it is the one that got tested.                                      |
| WPBakery                 | Hardest                          | Inline `<style>` blocks per shortcode with generated IDs. Token census picks up a lot of noise.                  |
| Oxygen                   | Moderate                         | Single generated stylesheet, `.ct-section` boundary. Rare enough to deprioritise.                                |

The gotchas skill is the only part that genuinely needs per-builder content, and it grows by use: port one Divi site and write down what bit you.

### One case that breaks the curl mirror

If a site renders content client-side (a React-based block plugin, or a headless front end on a WP backend), `curl` returns an empty shell. Add a `--render` flag to `/wp-mirror` that loads the page in the browser and saves `document.documentElement.outerHTML` after network idle instead. The browser layer is already there, so this is a few lines. Uncommon in WordPress, but when it happens the raw mirror fails in a way that looks like the site is broken.

---

## 3. Steps the original process was missing

These came out of thinking about what breaks when you leave Laravel and leave one specific site.

### Use the REST API for content, not scraping

If `/wp-json/wp/v2/pages?per_page=100` responds, you get titles, slugs, rendered content, featured media and menu structure as clean JSON. Same for `posts`, `media`, `categories`, and ACF fields if `acf-to-rest-api` or ACF 5.11+ is active. Custom post types show under `/wp-json/wp/v2/types`.

This is strictly better than parsing text out of rendered HTML, and it is the only sane path if the target stack has a CMS behind it. Try the API first, fall back to DOM extraction.

Also check `/wp-sitemap.xml` (core, since 5.5) or `/sitemap_index.xml` (Yoast/RankMath) for page discovery instead of crawling links.

### Measure at every breakpoint, not just 1440

The original measured at one width and noted that Elementor breaks at 767/768 and 1024/1025. Those are defaults and they are editable per site. Read the real values out of the generated CSS media queries rather than assuming, then measure at `max+1` and `max` on each side of every boundary. A section that matches at 1440 and collapses at 390 is the most common way a port ships broken.

Minimum viewport set: 1440, 1280, 1024, 768, 390. Store it in config so it can be extended.

### Kill animations before measuring

Elementor adds `.elementor-invisible` with `opacity: 0` and an animate.css class that only fires on scroll into view. `getBoundingClientRect()` reads post-transform boxes, so an element mid-entrance measures in the wrong place, or at height 0.

Every measurement pass must inject, before reading anything:

```js
const s = document.createElement("style");
s.textContent = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .elementor-invisible { opacity: 1 !important; }
  [data-aos] { opacity: 1 !important; transform: none !important; }
`;
document.head.appendChild(s);
```

Then scroll the full page height to trigger lazy sections and `content-visibility`, scroll back to 0, and only then read.

### Wait for fonts and images, explicitly

```js
await document.fonts.ready;
await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
```

Web fonts landing late shift every text height. This is not the same failure as the missing-token bug but produces identical symptoms, so rule it out first. The original's `setTimeout(r, 3000)` was papering over this.

### Diff computed styles, not only geometry

Two of the worst bugs in the source document (`text-28` undefined, `leading-normal` at 1.5) are style bugs that geometry only catches by luck. A style diff catches both directly.

Sample on every element carrying text or an image:

```
font-family, font-size, line-height, letter-spacing, font-weight,
color, background-color, border-radius, text-transform, opacity
```

**The hard part is node matching** across two different DOM structures. Heuristic, in order:

1. Normalised text content (collapse whitespace, lowercase) — matches most text nodes uniquely
2. Image `src` basename
3. `href` target
4. Ordinal position within the matched parent section

Anything that fails all four gets reported as "unmatched" rather than silently skipped. Unmatched count is itself a useful signal: if your port has 40 text nodes and the original has 52, you dropped content.

This is the main piece of genuinely new engineering in the plugin. Budget for it.

### Interactive behaviour is a whole phase

The source document covers layout and stops. A ported page also needs: mobile menu open/close, sliders and carousels, accordions and tabs, lightboxes, sticky header state change on scroll, scroll-triggered entrance animations, form submission, smooth anchor scrolling.

Elementor ships all of these as jQuery widget handlers in `frontend.min.js` plus the lazily loaded `*.bundle.min.js` chunks. You will not port that JS. You reimplement the behaviour.

The plugin should at minimum **inventory** it: scan the mirrored HTML for `data-settings`, `data-widget_type`, `.elementor-widget-<type>`, and list every interactive widget found per page with a one-line description of what it does. That list becomes a checklist. Automating the reimplementation is out of scope.

### Scrollbar width

A 1440 viewport gives `document.documentElement.clientWidth` of 1425 in Chrome on Windows and 1440 on macOS with overlay scrollbars. Percentage-based widths then differ by 15px between your machine and the original measurement.

Fix: always report `clientWidth` alongside the viewport in every dump, and set the browser to a fixed scrollbar behaviour. Compare only dumps taken with the same `clientWidth`.

### Font licensing

The mirror pulls down `.ttf`/`.woff2` files. Converting `Race Sport.ttf` to woff2 and shipping it from your own domain is a redistribution the original licence may not cover. One line in the output of `/wp-assets`: list every font family found and where it came from, so someone can check. Not a blocker, just do not let it be invisible.

---

## 4. Command set

Names prefixed `wp-` to avoid collisions. In a plugin these are invocable as `/wp-mirror` or `/wp-to-code:wp-mirror`.

### The lifecycle

| #   | Command                         | Automation                   | Ships in |
| --- | ------------------------------- | ---------------------------- | -------- |
| 1   | `/wp-init <url>`                | Wizard, writes config        | v1       |
| 2   | `/wp-mirror [--all\|<path>]`    | Full                         | v1       |
| 3   | `/wp-inventory`                 | Script + model judgement     | v1       |
| 4   | `/wp-theme`                     | Full, model names the tokens | v1       |
| 5   | `/wp-assets`                    | Full                         | v2       |
| 6   | `/wp-measure <page> [selector]` | Full                         | v1       |
| 7   | `/wp-content <page> [--api]`    | Full                         | v1       |
| 8   | `/wp-port <page>`               | Model                        | v1       |
| 9   | `/wp-diff <page> [--viewport]`  | Full                         | v1       |
| 10  | `/wp-audit`                     | Full                         | v1       |
| 11  | `/wp-responsive <page>`         | Full                         | v2       |
| 12  | `/wp-interactive <page>`        | Inventory only               | v2       |
| 13  | `/wp-model`                     | Model                        | v3       |
| 14  | `/wp-finish`                    | Full                         | v1       |

### 1. `/wp-init <url>`

Writes `.wp-to-code/config.json`. Everything else reads it. This is the piece the original process did not have and the piece that makes the plugin multi-stack.

What it does:

- Fetch the URL, detect the page builder from markup signatures
- Probe `/wp-json/wp/v2/` and `/wp-sitemap.xml`, record what is available
- Detect the target stack by looking at the current directory (`composer.json` with laravel/framework, `next.config.*`, `astro.config.*`, `package.json` deps, or nothing → plain HTML)
- Detect Tailwind and its major version
- Ask only what it cannot infer: which pages, styling mode, viewport set

```json
{
  "source": {
    "url": "https://forwarddsrpt.goonline.au",
    "builder": "elementor",
    "restApi": true,
    "sitemap": "/wp-sitemap.xml",
    "headers": {}
  },
  "pages": [
    {
      "slug": "home",
      "sourcePath": "/",
      "targetRoute": "/",
      "originalRoot": ".elementor-42",
      "portRoot": "main"
    }
  ],
  "target": {
    "stack": "next-app",
    "componentDir": "components/sections",
    "routeDir": "app"
  },
  "css": {
    "mode": "tailwind",
    "tailwindVersion": 4,
    "tokenFile": "app/globals.css"
  },
  "viewports": [1440, 1280, 1024, 768, 390],
  "mirror": { "dir": ".wp-to-code/mirror", "port": 4321, "images": "remote" },
  "port": { "devUrl": "http://localhost:3000" }
}
```

`originalRoot` and `portRoot` are the two selectors the diff compares children of. Resolved once by `/wp-inventory`, edited by hand when the heuristic guesses wrong.

### 2. `/wp-mirror`

Carries over from the original, unchanged in substance.

- `curl -sL -A "Mozilla/5.0"` each page. Trailing slash matters, WordPress 301s without it.
- Walk for CSS, JS, fonts. Recurse into CSS for `@import` and `url()`.
- Leave images and video remote. They are most of the bytes and they are the CMS's problem later.
- Extract the webpack chunk map. Elementor's `webpack.runtime.min.js` carries a `__webpack_require__.u` function listing every `*.bundle.min.js` it may fetch. Download all of them or lightboxes break silently.
- Rewrite URLs in all four encodings:

| Context                       | Looks like                     |
| ----------------------------- | ------------------------------ |
| HTML attribute                | `https://site.com/a.css`       |
| JSON in a script              | `https:\/\/site.com\/a.css`    |
| JSON inside an HTML attribute | escaped form inside `&quot;`   |
| JSON inside JSON              | `https:\\/\\/site.com\\/a.css` |

Stop the regex at `&quot;` or it swallows the rest of the attribute. Key the directory-URL rule on the path starting `/wp-content/` or `/wp-includes/`, not on file extension.

New in the plugin version:

- Output goes to `.wp-to-code/mirror/`, served by a static server on a fixed port. No framework route.
- Support `--header` passthrough so staging sites behind basic auth or a cookie can be mirrored.
- Record a manifest of what was downloaded and what was left remote, so `/wp-finish` knows exactly what to delete.

### 3. `/wp-inventory`

New. The original did this by hand, per page.

Walk every mirrored page, dump top-level sections with height, padding, background, and the widget types inside. Then cluster: hash each section's structure (tag sequence + widget types + text-node count) and group identical or near-identical sections across pages.

Output `.wp-to-code/inventory.md`:

```
about-us  §3  hero-title            unique
about-us  §4  event-list            shared with: events, home    ← component
about-us  §5  team-grid             shared with: team            ← component
```

This tells you the component list and the build order before you write a line. In the source project the reuse was: services 1 new section of 5, events 1 of 7, about-us 2 of 8, team 0 of 4. Knowing that up front changes how you sequence the work.

Also resolves `originalRoot` and `portRoot` per page and writes them back to config.

### 4. `/wp-theme`

Pull tokens from computed styles, not from the stylesheet. Elementor's generated CSS is unreadable; the browser has already resolved it.

For Gutenberg sites, read `theme.json` instead.

Census across all pages, then cluster:

- Every distinct `font-size`, with a count of how many elements use it
- Every distinct `color` and `background-color`
- Every distinct `font-family` with its resolved weight axis
- Media query boundaries found in the CSS (the real breakpoints)
- Spacing values that appear more than N times

Output depends on `css.mode`:

- `tailwind` v4 → an `@theme { }` block
- `tailwind` v3 → a `tailwind.config.js` `theme.extend`
- `passthrough`/`prune` → a plain report, no token file
- Any stack → CSS custom properties as a fallback

**Name type tokens by pixel value.** `--text-23: 23px`. When a measurement reads `23px/27.6px` you write `text-23 leading-[27.6px]` with no arithmetic. This one convention removed most of the friction in the original project.

**Enumerate every size before starting.** A token used but never defined emits nothing and the element silently inherits. See gotchas.

### 5. `/wp-assets`

- Fonts: find every `@font-face` src, download, convert `.ttf`/`.otf` → `.woff2` (`fonttools`, `pyftsubset` for subsetting). The source project went 43KB → 12KB on one face. Report the licence source per family.
- Images: three policies. `remote` (default, leave them on the origin), `download` (pull into `public/`), `optimize` (pull, convert to webp/avif, emit `srcset`). The choice belongs in config.
- Inline SVG: Elementor icon widgets emit inline SVG. Extract to a sprite or per-icon components depending on stack.

### 6. `/wp-measure <page> [selector]`

The dump helper. Runs the browser, applies the animation kill and the font/image wait, then writes a layout tree to `.wp-to-code/measure/<page>-<viewport>.json`.

Per element with text or an image: rect, font-family, font-size, line-height, letter-spacing, weight, color, background, margin, padding, and a stable path selector.

**Output goes to a file. Always.** Measuring a 3000px section inline is what stalled the event page in the original project. The command prints a summary of at most 20 lines; the model reads the file with a filter script when it needs detail.

### 7. `/wp-content <page> [--api]`

Content only. Text, image URLs, hrefs, alt text. Separate file from the geometry dump.

`--api` pulls from `/wp-json` instead of the DOM when available. Mixing content and geometry in one pass produces output too large to read, which is a lesson worth encoding in the command itself rather than in prose.

### 8. `/wp-port <page>`

Model work. Loads the gotchas skill, the stack adapter, the measurement file and the content file, then writes the components.

Rules the adapter enforces:

- Use measured numbers as arbitrary values (`mb-[11px]`, `h-[56px]`). Do not round to the framework's scale, you will spend longer chasing 2px than you saved.
- Never interpolate a value into a class name. Tailwind's scanner reads source text, so `pl-[{{ $x }}px]` produces nothing. Genuinely dynamic values go in an inline `style`.
- Props are flat, string-keyed. That is the shape a CMS repeater hands back, so wiring the CMS later is passing data through, not reshaping it.
- Variation between pages is a prop, not a copy: padding, container width, row height.

### 9. `/wp-diff <page> [--viewport 1440]`

The gate. The single command that makes the rest work.

Opens the mirror and the port in two browser pages at the same viewport, applies the same animation kill and wait to both, walks `originalRoot` and `portRoot` children, prints:

```
              height          top             verdict
hero          839 vs 838      0 vs 0          MATCH
stats         267 vs 267      839 vs 838      MATCH
mission       612 vs 612      1106 vs 1206    Δtop 100   ← margin collapse
news          860 vs 843      1718 vs 1818    Δh 17
unmatched nodes: 3
```

**Compares position as well as height.** Most of the bugs in the source document pass a height check. The mission-block background bug (margin collapse dragging the section background up 100px) was only visible as a position delta.

Flags:

- `--viewport 1440,768,390` runs all three
- `--style` adds the computed-style diff on matched text nodes
- `--json` writes the full delta to a file instead of printing

Two to four rounds per page is normal.

### 10. `/wp-audit`

The silent-failure checks. Runs against the port source, no browser needed for most of it.

- Type tokens used but never defined:

```bash
comm -13 <(grep -o '\-\-text-[0-9]*' app/globals.css | sed 's/--//' | sort -u) \
         <(grep -rhoE 'text-[0-9]+\b' components/ | sort -u)
```

- Same for colour tokens
- `leading-normal` on anything with a font size over 18px
- Classes used exactly once across the whole project (usually a typo or a missed component)
- Arbitrary values that are within 1px of a defined token (should have used the token)
- Fixed-width boxes carrying horizontal padding (see gotchas)
- Interpolated class names (`class="p-[{{ ... }}]"`)

Run this before trusting any measurement pass.

### 11. `/wp-responsive <page>`

`/wp-diff` at every viewport in config, in one table. Also reports which viewports the original's own CSS defines, so you can catch a breakpoint you did not implement at all.

### 12. `/wp-interactive <page>`

Inventory, not automation. Scans the mirrored HTML for `data-widget_type`, `data-settings`, and known builder classes; lists every interactive behaviour with its configuration. Produces a checklist the model works through by hand.

### 13. `/wp-model`

For CMS-bound targets. Reads the clustered sections from `/wp-inventory` and the content dumps, derives a data shape per repeated component, and emits it in the target's idiom (Filament resource, Payload collection, Sanity schema, plain TypeScript types). Furthest out, most speculative. v3 at the earliest.

### 14. `/wp-finish`

- Run `/wp-responsive` on every page. Refuse to proceed if anything is off.
- Delete `.wp-to-code/mirror/`, the measurement dumps, the static server config.
- Print a summary of what was removed and what stayed.

The source project deleted ~8MB in one commit after the last page matched. Keep the mirror until then, not a day less.

---

## 5. The browser layer: the main build decision

Every automated command needs a browser. Four ways to get one.

| Approach                                            | Cost to build | Cost to run                           | Verdict                      |
| --------------------------------------------------- | ------------- | ------------------------------------- | ---------------------------- |
| Bundle Playwright, run via Bash, write JSON to disk | Medium        | Low                                   | **Recommended**              |
| Depend on `chrome-devtools-mcp`                     | Near zero     | High, every rect goes through context | Fallback only                |
| Ship an MCP server inside the plugin                | High          | Low                                   | Over-engineering for v1      |
| Claude in Chrome extension                          | Low           | Medium, interactive only              | Useful for auth-walled sites |

Playwright wins because of the context-discipline constraint. The whole reason the original process stalled on the event page was JSON flooding the context. A Bash-invoked script writing to a file and printing 20 lines does not have that problem, and an MCP tool call returning a rect tree does.

Install without the 300MB browser download by using `playwright-core` against the user's installed Chrome:

```js
const browser = await chromium.launch({ channel: "chrome" });
```

Falls back to `npx playwright install chromium` only if no Chrome is found. Install into `${CLAUDE_PLUGIN_DATA}` via a `SessionStart` hook using the manifest-diff pattern from the plugin docs, so it survives plugin updates and reinstalls only when `package.json` changes.

The chrome-devtools MCP fallback is worth keeping as a `--mcp` flag for people who cannot run Node scripts, but do not build it first.

---

## 6. Plugin structure

```
wp-to-code/                          ← repo root, also the marketplace
├─ .claude-plugin/
│  └─ marketplace.json
├─ plugins/
│  └─ wp-to-code/
│     ├─ .claude-plugin/
│     │  └─ plugin.json
│     ├─ commands/
│     │  ├─ wp-init.md
│     │  ├─ wp-mirror.md
│     │  ├─ wp-inventory.md
│     │  ├─ wp-theme.md
│     │  ├─ wp-measure.md
│     │  ├─ wp-content.md
│     │  ├─ wp-port.md
│     │  ├─ wp-diff.md
│     │  ├─ wp-audit.md
│     │  └─ wp-finish.md
│     ├─ skills/
│     │  ├─ porting-gotchas/SKILL.md      ← read before writing markup
│     │  ├─ measure-discipline/SKILL.md   ← how to dump and read without flooding context
│     │  └─ builder-notes/SKILL.md        ← Elementor/Divi/Bricks/Gutenberg reference
│     ├─ adapters/
│     │  ├─ laravel-blade.md
│     │  ├─ next-app.md
│     │  ├─ astro.md
│     │  ├─ react-vite.md
│     │  ├─ vue-nuxt.md
│     │  ├─ svelte.md
│     │  ├─ plain-html.md
│     │  └─ wp-block-theme.md
│     ├─ scripts/
│     │  ├─ mirror.mjs
│     │  ├─ measure.mjs
│     │  ├─ diff.mjs
│     │  ├─ theme.mjs
│     │  ├─ audit.sh
│     │  ├─ browser.mjs               ← shared launch + animation kill + wait
│     │  └─ package.json
│     ├─ hooks/
│     │  └─ hooks.json
│     └─ README.md
└─ README.md
```

### plugin.json

```json
{
  "name": "wp-to-code",
  "displayName": "WordPress to code",
  "version": "0.1.0",
  "description": "Port a WordPress site to any stack by measuring the original and diffing rendered geometry.",
  "author": { "name": "Safi", "url": "https://github.com/abdulkadersafi" },
  "repository": "https://github.com/abdulkadersafi/wp-to-code",
  "license": "MIT",
  "keywords": ["wordpress", "elementor", "tailwind", "migration", "port"],
  "hooks": "./hooks/hooks.json",
  "userConfig": {
    "chrome_path": {
      "type": "file",
      "title": "Chrome executable",
      "description": "Leave blank to autodetect. Set if Chrome is installed somewhere unusual.",
      "required": false
    }
  }
}
```

Note: `${user_config.*}` is rejected in shell-form hook commands. Read `CLAUDE_PLUGIN_OPTION_CHROME_PATH` from the environment inside the script instead.

### marketplace.json

```json
{
  "name": "wp-to-code",
  "owner": { "name": "Safi", "url": "https://github.com/abdulkadersafi" },
  "plugins": [
    {
      "name": "wp-to-code",
      "source": "./plugins/wp-to-code",
      "description": "Port a WordPress site to Laravel, Next, Astro, or plain HTML by measuring the original."
    }
  ]
}
```

Users install with:

```
/plugin marketplace add abdulkadersafi/wp-to-code
/plugin install wp-to-code@wp-to-code
```

`claude plugin validate ./plugins/wp-to-code --strict` in CI catches manifest typos before anyone installs a broken version.

Single-plugin repo is fine and keeps the install string short. If a second plugin ever appears, the `plugins/` folder is already in place.

---

## 7. Hooks worth having

**`SessionStart`** — install the Node dependencies into `${CLAUDE_PLUGIN_DATA}` using the manifest-diff pattern, so an update to `package.json` triggers a reinstall and nothing else does.

**`PostToolUse` on Write and Edit** — when a file inside `target.componentDir` is written, run the token audit and surface undefined tokens immediately. This turns the `text-28` bug from a four-hour silent failure into an inline warning at the moment of writing. Highest-value hook by a distance.

**`Stop`** — refuse a completion claim when the most recent `/wp-diff` for the page in question is not green, or is older than the last edit to that page's components. Encodes the rule directly:

> Never claim a page is done without a numeric comparison, and always compare position as well as height.

This one is aggressive and some people will hate it. Make it opt-in through `userConfig`.

---

## 8. Gotchas to ship as a skill

The model reads this **before** writing markup, not after discovering each one.

### From the original project

**`leading-normal` is 1.5em and the design usually wants less.** A 20px title with `leading-normal` renders at 30px; Elementor's is 24px. Cost 17px on one section and 30px on another. Always take line-height from the measurement, never from a named token, unless you have checked it.

**A missing type token fails silently.** `text-28` was used in three places and never defined. Tailwind emits nothing, the element inherits 14px, and section heights stay correct because the overlay was absolutely positioned. Every team member's name on four pages rendered at half size for hours.

**Padding on a fixed-width box shrinks the content.** `w-[287px] pl-[15px]` gives a 272px content box, which rewraps text and changes height. Put the gap on the sibling instead.

**Elementor paragraphs carry a hidden 14.4px bottom margin** on top of the widget's own margin. A text block measuring 62px where the paragraph is 48px is this, every time.

**Inline-block descenders.** A `<textarea>` without `display: block` adds about 7px below it. Enough to fail a comparison and nearly impossible to see by eye.

**Margin collapse moves whole sections.** A `-mt-[100px]` on an inner div collapsed out of its section and dragged the section's background image up 100px. Section height was correct either way. Only a position comparison caught it. Fix with `flow-root` on the container.

**Elementor's negative margins differ per page.** The same post block wraps in a 558px row on one page and 570px on another. State the row height as a prop and say why. Do not chase it with a magic clip value.

**Background video is not a styling bug.** Two screenshots of the same 38-second loop at different moments look like different designs. Pin `video.currentTime` on both before comparing.

**Offscreen iframes pause video.** Browsers pause `<video>` in an offscreen iframe, so the original sits on frame 0 while yours plays. Harmless for layout, misleading for anything visual.

### Added for the general case

**Entrance animations shift rects.** `.elementor-invisible`, `[data-aos]`, animate.css classes. Kill all animation and transition before measuring, and force those elements visible.

**Fonts landing late shift every text height.** `await document.fonts.ready` before any rect read. Symptoms are identical to a missing token, so rule this out first.

**`content-visibility: auto` reports height 0 until scrolled.** Scroll the full page, then return to 0, then measure.

**Scrollbar width changes the effective viewport.** Report `document.documentElement.clientWidth` in every dump and refuse to compare dumps taken at different values.

**Elementor per-post CSS scoping breaks passthrough componentisation.** Rules are written as `.elementor-42 .elementor-element-a1b2c3`. Rename the wrapper and the styles stop applying. If you are keeping the CSS, keep the wrapper markup too.

**Breakpoints are site-editable.** 767/768 and 1024/1025 are Elementor's defaults, not guarantees. Read the real media query boundaries from the generated CSS.

**Container width comes from global settings.** Elementor boxed containers take their max-width from `--container-max-width` in the site's global CSS, not from anything on the section. Look there before hardcoding.

**Font smoothing changes text metrics slightly.** Many WP themes set `-webkit-font-smoothing: antialiased`. If your port does not, glyph widths differ enough to rewrap a tight line.

**Images without intrinsic dimensions reflow.** Await `img.decode()` on every image before measuring, and set explicit width/height in the port.

---

## 9. Build order

**v1, the minimum that reproduces the original process on any stack:**

`browser.mjs` (launch, animation kill, font/image wait) → `measure.mjs` → `diff.mjs` → `/wp-diff` → the gotchas skill → `/wp-mirror` → `/wp-init` → `/wp-theme` → `/wp-audit` → three adapters (blade, next-app, plain-html).

Build the diff first. Everything else exists to feed it, and you cannot tell whether the rest works without it.

**v2:** style diff with node matching, `/wp-inventory` clustering, `/wp-responsive`, `/wp-assets`, `/wp-interactive`, the `prune` CSS mode, remaining adapters.

**v3:** `/wp-model`, screenshot diffing at `/wp-finish`, Divi and Bricks builder support beyond detection.

**Not planned:** automated JS behaviour porting, `extract-css` naming mode, WooCommerce or any dynamic page type.

---

## 10. Open questions

1. **Node matching for the style diff.** The four-step heuristic above is untested at scale. If it produces too many unmatched nodes on a real page, the style diff is not usable and geometry stays the only gate. Prototype this against the forwarddsrpt mirror before committing to it.

2. **Does `/wp-inventory` clustering actually find the components?** Structural hashing will group identical sections. It will probably miss "same component, different content length". Needs a similarity threshold, and the threshold needs tuning against a real site.

3. **Whether passthrough mode is worth shipping at all.** The Elementor scoping constraint means it degrades to "copy the HTML", which anyone can do with wget. The honest version might be that only `tailwind` and `prune` are real modes.

4. **Chrome version drift.** Measurements taken on Chrome 141 and compared against Chrome 148 may differ by a subpixel on text-heavy blocks. Probably fine at 1px rounding. Worth confirming before promising pixel accuracy in the README.

5. **How much the model needs the adapter at all.** It may be that stating "this is a Next.js App Router project, components go in `components/sections`" in the config is enough and the adapter files are dead weight. Test with two stacks before writing eight adapter files.

---

## Sources

- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Converting a WordPress site to a static site using Wget](https://osric.com/chris/accidental-developer/2024/01/converting-a-wordpress-site-to-a-static-site-using-wget/)
- [HTTrack vs Wget comparison](https://www.webasha.com/blog/httrack-vs-wget-a-comprehensive-comparison-of-the-best-website-mirroring-tools-for-osint-and-cybersecurity)
- [Windy, browser extension for element-to-Tailwind conversion](https://usewindy.com/)
- [Tailscan](https://tailscan.com/)

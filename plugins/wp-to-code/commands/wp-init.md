---
description: Set up a WordPress port. Detects the source builder and the target stack, then writes .wp-to-code/config.json.
argument-hint: "<source-url>"
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

Set up a port of the site the user named: `$ARGUMENTS`.

## 1. Detect

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect.mjs" --url <url>
```

This reports the page builder, whether the REST API and a sitemap are available, the pages it found, and which stack the current directory already is. The JSON goes to stdout, the readable summary to stderr.

## 2. Ask only what detection could not answer

Detection covers the builder, the page list, the stack and the Tailwind version. What is left:

- **Which pages to port.** The sitemap usually returns everything including blog posts. Show the list and let the user pick. Ten pages is a normal scope; forty is not.
- **Styling mode.** `tailwind` rebuilds the styles from measured values, which is slower and gives clean output. `passthrough` keeps the original CSS, which is fast but, on Elementor, means keeping the original wrapper markup too, because the CSS is scoped per post ID. Say that trade-off plainly rather than listing the modes.
- **Dev server URL**, if the guess is wrong.

Do not ask about the builder, the breakpoints or the token names. Those come from measurement later.

## 3. Write the config

```json
{
  "source": {
    "url": "https://example.com",
    "builder": "elementor",
    "restApi": true,
    "sitemap": "/wp-sitemap.xml",
    "headers": {}
  },
  "pages": [
    { "slug": "home", "sourcePath": "/", "targetRoute": "/",
      "originalRoot": null, "portRoot": "main" }
  ],
  "target": { "stack": "next-app", "componentDir": "components/sections", "routeDir": "app" },
  "css": { "mode": "tailwind", "tailwindVersion": 4, "tokenFile": "app/globals.css" },
  "viewports": [1440, 1280, 1024, 768, 390],
  "mirror": { "dir": ".wp-to-code/mirror", "port": 4321, "images": "remote" },
  "port": { "devUrl": "http://localhost:3000" }
}
```

`originalRoot` is the selector whose direct children are the page's top-level sections. Leave it null now: you cannot know it until the page is mirrored. `/wp-mirror` is the next step, and after it you find the root by grepping the mirrored HTML for the builder's page-root class, then checking which candidate has the most sections with `/wp-measure --mode sections`.

Add `.wp-to-code/` to the project's `.gitignore`. The mirror is several megabytes and it gets deleted at the end anyway.

If the site needs authentication, put the cookie or basic auth header in `source.headers`. It is used for every fetch.

## 4. Tell the user the order

```
/wp-mirror            download the original
/wp-theme             extract design tokens
/wp-measure <page>    look at a page
/wp-port <page>       write it
/wp-diff <page>       check it
/wp-finish            delete the mirror when every page matches
```

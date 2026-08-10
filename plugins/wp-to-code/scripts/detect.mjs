#!/usr/bin/env node
// Everything /wp-init can work out on its own: which page builder the source
// uses, whether the REST API and a sitemap are available, what pages exist, and
// which stack the current directory already is.
//
// Ask the user only what this cannot answer.
//
//   node detect.mjs --url https://site.com
import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// Ordered: the first match wins, so more specific signatures come first.
const BUILDERS = [
  {
    name: "elementor",
    test: /elementor-frontend|class="[^"]*elementor-page|elementor-widget-container/,
  },
  { name: "divi", test: /et_pb_section|id="et-boc"|et-core-unified/ },
  { name: "bricks", test: /brxe-|bricks\/frontend/ },
  { name: "beaver-builder", test: /fl-builder-content|fl-row-content-wrap/ },
  { name: "wpbakery", test: /vc_row|js_composer/ },
  { name: "oxygen", test: /ct-section|oxygen-vsb/ },
  { name: "gutenberg", test: /wp-block-|wp-container-/ },
];

// Where each builder puts the top-level sections of a page.
const SECTION_ROOTS = {
  elementor:
    '.elementor-<postid>  (find it with: grep -oE "elementor-[0-9]+" on the mirrored page)',
  divi: "#et-boc .et_builder_inner_content",
  bricks: ".brx-content, main",
  "beaver-builder": ".fl-builder-content",
  wpbakery: ".wpb_row, .entry-content",
  oxygen: "#inner_content, .ct-section",
  gutenberg: ".wp-site-blocks, main",
};

const { values } = parseArgs({
  options: { url: { type: "string" }, dir: { type: "string" } },
});
if (!values.url) {
  console.error("Usage: detect.mjs --url https://site.com [--dir .]");
  process.exit(1);
}

const origin = new URL(values.url).origin;
const cwd = values.dir ?? process.cwd();
const report = { source: {}, pages: [], target: {} };

// --- source ----------------------------------------------------------------

const html = await get(origin + "/");
if (html == null) {
  console.error(
    `Could not fetch ${origin}/. Check the URL, or pass credentials via source.headers.`,
  );
  process.exit(1);
}

report.source.url = origin;
report.source.builder =
  BUILDERS.find((b) => b.test.test(html))?.name ?? "unknown";
report.source.sectionRootHint =
  SECTION_ROOTS[report.source.builder] ?? "main, body";
report.source.generator =
  html.match(/<meta name="generator" content="([^"]+)"/i)?.[1] ?? null;
report.source.restApi = (await get(origin + "/wp-json/wp/v2/types")) != null;

for (const path of ["/wp-sitemap.xml", "/sitemap_index.xml", "/sitemap.xml"]) {
  const xml = await get(origin + path);
  if (xml) {
    report.source.sitemap = path;
    report.pages = await pagesFromSitemap(xml, origin);
    break;
  }
}

if (!report.pages.length && report.source.restApi) {
  const json = await get(
    origin + "/wp-json/wp/v2/pages?per_page=100&_fields=link,slug,title",
  );
  if (json) {
    try {
      report.pages = JSON.parse(json).map((p) => ({
        slug: p.slug || "home",
        sourcePath: new URL(p.link).pathname,
      }));
    } catch {
      /* not JSON, ignore */
    }
  }
}

// --- target ----------------------------------------------------------------

const pkg = readJson(join(cwd, "package.json"));
const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
const has = (name) => Boolean(deps[name]);
const fileExists = (...names) => names.some((n) => existsSync(join(cwd, n)));

report.target.stack = fileExists(
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
)
  ? existsSync(join(cwd, "app"))
    ? "next-app"
    : "next-pages"
  : fileExists("astro.config.mjs", "astro.config.ts")
    ? "astro"
    : fileExists("nuxt.config.ts", "nuxt.config.js")
      ? "nuxt"
      : fileExists("svelte.config.js")
        ? "svelte"
        : has("vue")
          ? "vue"
          : has("react")
            ? "react-vite"
            : hasLaravel(cwd)
              ? "laravel-blade"
              : "plain-html";

const twVersion = deps.tailwindcss?.replace(/[^0-9.]/g, "").split(".")[0];
report.target.tailwind = twVersion ? Number(twVersion) : null;
report.target.devUrlGuess =
  report.target.stack.startsWith("next") || report.target.stack === "nuxt"
    ? "http://localhost:3000"
    : report.target.stack === "astro"
      ? "http://localhost:4321"
      : report.target.stack === "laravel-blade"
        ? "http://localhost:8000"
        : "http://localhost:5173";

// --- report ----------------------------------------------------------------

console.log(JSON.stringify(report, null, 2));
console.error(`
source
  builder     ${report.source.builder}${report.source.generator ? `  (${report.source.generator})` : ""}
  REST API    ${report.source.restApi ? "available, use it for content" : "not available, extract content from the DOM"}
  sitemap     ${report.source.sitemap ?? "none found"}
  pages       ${report.pages.length} discovered
  root hint   ${report.source.sectionRootHint}

target
  stack       ${report.target.stack}
  tailwind    ${report.target.tailwind ? `v${report.target.tailwind}` : "not installed"}
  dev url     ${report.target.devUrlGuess} (guess, confirm with the user)
`);

// ===========================================================================

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function pagesFromSitemap(xml, origin) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].trim(),
  );
  // A sitemap index points at more sitemaps rather than at pages.
  const isIndex = /<sitemapindex/i.test(xml);
  if (isIndex) {
    const out = [];
    for (const loc of locs.slice(0, 5)) {
      const child = await get(loc);
      if (child) out.push(...(await pagesFromSitemap(child, origin)));
    }
    return dedupe(out);
  }
  return dedupe(
    locs
      .filter((u) => u.startsWith(origin))
      .map((u) => {
        const path = new URL(u).pathname;
        const slug =
          path
            .replace(/^\/|\/$/g, "")
            .split("/")
            .pop() || "home";
        return { slug, sourcePath: path };
      }),
  );
}

function dedupe(pages) {
  const seen = new Set();
  return pages.filter((p) => (seen.has(p.slug) ? false : seen.add(p.slug)));
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function hasLaravel(dir) {
  const composer = readJson(join(dir, "composer.json"));
  return Boolean(composer?.require?.["laravel/framework"]);
}

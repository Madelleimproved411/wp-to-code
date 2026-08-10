#!/usr/bin/env node
// Mirrors a WordPress site to a local directory that can be served flat.
//
// Downloads CSS, JS and fonts, preserving path structure so relative url()
// references inside stylesheets still resolve. Leaves images and video remote:
// they are most of the bytes and they are the CMS's problem later.
//
//   node mirror.mjs                        # every page in config
//   node mirror.mjs --page home
//   node mirror.mjs --render               # snapshot post-JS DOM instead of raw HTML
//   node mirror.mjs --no-sweep             # skip the browser pass for lazy chunks
import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, extname, relative } from "node:path";
import { loadConfig } from "./config.mjs";

const DOWNLOAD_EXT = new Set([
  ".css",
  ".js",
  ".mjs",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
]);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const { values } = parseArgs({
  options: {
    page: { type: "string" },
    render: { type: "boolean", default: false },
    "no-sweep": { type: "boolean", default: false },
  },
});

const cfg = loadConfig();
const origin = new URL(cfg.source.url).origin;
const host = new URL(cfg.source.url).host;
const outDir = join(cfg._root, cfg.mirror?.dir ?? ".wp-to-code/mirror");
const headers = { "user-agent": UA, ...(cfg.source.headers ?? {}) };
const pages = values.page
  ? cfg.pages.filter((p) => p.slug === values.page)
  : cfg.pages;

if (!pages.length) {
  console.error(
    `No pages to mirror. Check "pages" in .wp-to-code/config.json.`,
  );
  process.exit(1);
}

/** Local paths successfully downloaded, used to decide what to rewrite. */
const downloaded = new Set();
const failed = [];
const htmlFiles = [];

console.log(`Mirroring ${origin} → ${relative(cfg._root, outDir)}`);

// --- pages -----------------------------------------------------------------

for (const page of pages) {
  const url = normalise(origin + (page.sourcePath ?? "/"));
  const html = values.render ? await renderPage(url) : await fetchText(url);
  if (html == null) {
    failed.push(url);
    continue;
  }
  const file = join(outDir, `${page.slug}.html`);
  write(file, html);
  htmlFiles.push(file);
  console.log(`  page  ${page.slug}  ${(html.length / 1024).toFixed(0)}KB`);
}

// --- assets ----------------------------------------------------------------

const queue = new Set();
for (const file of htmlFiles)
  collectFrom(readFileSync(file, "utf8"), origin, queue);

await drain(queue);

// Elementor and friends load extra bundles at runtime that never appear in the
// HTML. Their filenames do appear inside the JS already downloaded.
const lazy = new Set();
for (const path of downloaded) {
  if (extname(path) !== ".js") continue;
  const js = readFileSync(join(outDir, path), "utf8");
  for (const m of js.matchAll(/["'`]([\w.-]+\.bundle(?:\.min)?\.js)["'`]/g)) {
    const guess = join(dirname(path), m[1]);
    if (!downloaded.has(guess))
      lazy.add(origin + "/" + guess.split("\\").join("/"));
  }
}
if (lazy.size) {
  console.log(`  lazy bundles referenced in JS: ${lazy.size}`);
  await drain(lazy);
}

// --- rewrite ---------------------------------------------------------------

let rewritten = 0;
for (const file of [
  ...htmlFiles,
  ...[...downloaded].map((p) => join(outDir, p)),
]) {
  if (![".html", ".css", ".js", ".mjs"].includes(extname(file))) continue;
  const before = readFileSync(file, "utf8");
  const after = rewrite(before);
  if (after !== before) {
    writeFileSync(file, after);
    rewritten++;
  }
}

console.log(`\n  ${downloaded.size} assets, ${rewritten} files rewritten`);
if (failed.length)
  console.log(
    `  ${failed.length} failed:\n    ${failed.slice(0, 10).join("\n    ")}`,
  );

// --- browser sweep ---------------------------------------------------------

if (!values["no-sweep"]) {
  const missing = await sweep();
  if (missing.size) {
    console.log(
      `  sweep found ${missing.size} assets requested at runtime but not mirrored`,
    );
    await drain(missing);
    for (const file of htmlFiles)
      writeFileSync(file, rewrite(readFileSync(file, "utf8")));
  } else {
    console.log("  sweep: no missing runtime assets");
  }
}

console.log(`\nServe it:  node "${import.meta.dirname}/serve.mjs"`);

// ===========================================================================

function normalise(url) {
  // WordPress 301s a path without its trailing slash, and a naive fetch that
  // does not follow the redirect writes an empty file.
  const u = new URL(url);
  if (!extname(u.pathname) && !u.pathname.endsWith("/")) u.pathname += "/";
  return u.toString();
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function renderPage(url) {
  const { launch, prepare } = await import("./browser.mjs");
  const browser = await launch();
  try {
    const { page, context } = await prepare(
      browser,
      url,
      cfg.viewports?.[0] ?? 1440,
    );
    const html = await page.content();
    await context.close();
    return html;
  } finally {
    await browser.close();
  }
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * Pulls candidate asset URLs out of any text: markup, CSS or JS.
 *
 * Attribute and url() matching alone is not enough. WordPress also puts asset
 * URLs inside inline JSON, where they appear only in escaped-slash form and no
 * attribute pattern sees them: the emoji settings blob and Elementor's lottie
 * defaults both hide there. Missing one leaves the mirror quietly pointing at
 * the live site, so discovery also scans a slash-normalised copy of the text
 * for anything origin-absolute.
 */
function collectFrom(text, base, into) {
  const flat = text.split("\\/").join("/");
  const originRe = new RegExp(
    `https?://${host.replace(/\./g, "\\.")}/[^"'\\s)\\\\<>]+`,
    "gi",
  );
  for (const m of flat.matchAll(originRe)) add(m[0], base, into);

  const patterns = [
    /(?:href|src|data-src)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /@import\s+["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      add(m[1].replace(/\\\//g, "/"), base, into);
    }
  }
}

function add(raw, base, into) {
  raw = raw.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("#")) return;
  let url;
  try {
    url = new URL(raw, base);
  } catch {
    return;
  }
  if (url.origin !== origin) return;
  if (!DOWNLOAD_EXT.has(extname(url.pathname).toLowerCase())) return;
  into.add(url.origin + url.pathname + url.search);
}

/** Downloads everything in `queue`, following CSS into its own dependencies. */
async function drain(queue) {
  const pending = [...queue];
  queue.clear();
  while (pending.length) {
    const batch = pending.splice(0, 8);
    const results = await Promise.all(batch.map(download));
    for (const found of results) {
      for (const url of found) if (!pending.includes(url)) pending.push(url);
    }
  }
}

/** Returns URLs discovered inside the downloaded file, for CSS recursion. */
async function download(url) {
  const path = new URL(url).pathname.replace(/^\//, "");
  if (downloaded.has(path)) return [];

  const file = join(outDir, path);
  const ext = extname(path).toLowerCase();

  if (existsSync(file)) {
    downloaded.add(path);
  } else {
    let body;
    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      if (!res.ok) {
        failed.push(`${res.status} ${url}`);
        return [];
      }
      body = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      failed.push(`${err.code ?? "ERR"} ${url}`);
      return [];
    }
    write(file, body);
    downloaded.add(path);
  }

  if (ext !== ".css" && ext !== ".js" && ext !== ".mjs") return [];
  const next = new Set();
  collectFrom(readFileSync(file, "utf8"), url, next);
  return [...next];
}

/**
 * Rewrites absolute references to assets we hold, in all four encodings the
 * same URL appears in. Only paths in `downloaded` are touched, so images and
 * video keep pointing at the origin.
 */
function rewrite(text) {
  const bare = origin.replace(/^https?:/, "");
  // Most downloaded JS never names the origin. Skip those without scanning
  // the file once per known asset path.
  if (!text.includes(host)) return text;
  // Longest first, so /a/b.css is never partly replaced by a rule for /a.
  for (const path of [...downloaded].sort((a, b) => b.length - a.length)) {
    const abs = `/${path}`;
    for (const prefix of [origin, bare]) {
      text = text.split(prefix + abs).join(abs);
      text = text.split(esc(prefix + abs)).join(esc(abs));
      text = text.split(esc2(prefix + abs)).join(esc2(abs));
    }
  }
  return text;
}

// Function declarations, not consts: rewrite() runs at module top level, before
// a `const` further down the file would be initialised.
function esc(s) {
  return s.split("/").join("\\/");
}
function esc2(s) {
  return s.split("/").join("\\\\/");
}

/**
 * Loads each mirrored page in a browser and records every request the mirror
 * could not serve. This replaces per-builder chunk-map parsing: whatever the
 * page actually asks for at runtime shows up as a 404 against our own server.
 */
async function sweep() {
  const { launch, prepare } = await import("./browser.mjs");
  const { startServer } = await import("./serve.mjs");
  const port = cfg.mirror?.port ?? 4321;
  const server = await startServer(outDir, port);
  const browser = await launch();
  const missing = new Set();

  try {
    for (const page of pages) {
      const url = `http://127.0.0.1:${port}/${page.slug}.html`;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const tab = await context.newPage();
      tab.on("response", (res) => {
        if (res.status() !== 404) return;
        const path = new URL(res.url()).pathname;
        if (DOWNLOAD_EXT.has(extname(path).toLowerCase()))
          missing.add(origin + path);
      });
      tab.on("requestfailed", (req) => {
        const path = new URL(req.url()).pathname;
        if (DOWNLOAD_EXT.has(extname(path).toLowerCase()))
          missing.add(origin + path);
      });
      await tab
        .goto(url, { waitUntil: "load", timeout: 45000 })
        .catch(() => {});
      await tab.waitForTimeout(2500);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return missing;
}

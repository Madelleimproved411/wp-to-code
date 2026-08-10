// Shared browser layer. Every measurement in this plugin goes through prepare(),
// so the original and the port are always read under identical conditions.
//
// Three things happen here that the naive version gets wrong:
//   1. Animations are killed. Elementor, Divi and AOS all start elements
//      translated or at opacity 0, and getBoundingClientRect reads the
//      post-transform box.
//   2. The page is scrolled end to end, then back to 0. Lazy sections and
//      `content-visibility: auto` report height 0 until they have been near
//      the viewport once.
//   3. Fonts and images are awaited explicitly. A late web font shifts every
//      text height, and the symptoms look identical to a missing type token.
import { chromium } from "playwright-core";

export const PREP_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
  html { scroll-behavior: auto !important; }
  /* Entrance-animation holding states, by builder. */
  .elementor-invisible,
  .et_animated, .et_had_animation,
  .fl-animated, .fl-node-content,
  .animated, .wow,
  [data-aos], [data-animation] {
    opacity: 1 !important;
    transform: none !important;
    visibility: visible !important;
  }
`;

/**
 * Launches a browser. Prefers the user's installed Chrome so no 300MB download
 * is needed; falls back to Edge, then to a bundled Chromium if one was installed
 * separately with `npx playwright install chromium`.
 */
export async function launch() {
  const explicit = process.env.CLAUDE_PLUGIN_OPTION_CHROME_PATH;
  const attempts = explicit
    ? [{ executablePath: explicit }]
    : [{ channel: "chrome" }, { channel: "msedge" }, {}];

  const errors = [];
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch (err) {
      errors.push(err.message.split("\n")[0]);
    }
  }
  throw new Error(
    "Could not launch a browser. Install Google Chrome, or set the " +
      "chrome_path option on the wp-to-code plugin.\nTried:\n  " +
      errors.join("\n  "),
  );
}

/**
 * Opens `url` at `width` CSS pixels and returns a page that is safe to measure.
 * Also returns clientWidth: scrollbars mean a 1440 viewport is not always a
 * 1440 layout, and two dumps taken at different clientWidths are not comparable.
 */
export async function prepare(browser, url, width, { timeout = 45000 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "load", timeout });
  await page.addStyleTag({ content: PREP_CSS });

  // Walk the full page so lazy content and content-visibility sections lay out,
  // then return to the top so every rect is measured from the same origin.
  await page.evaluate(async () => {
    // Timers, not requestAnimationFrame. Headless Chrome throttles rAF when
    // nothing is compositing, and a nested rAF await can simply never resolve.
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(400, window.innerHeight - 100);
    let y = 0;
    // Re-read scrollHeight each turn: loading content makes the page grow.
    for (let i = 0; i < 200; i++) {
      const max = document.documentElement.scrollHeight;
      if (y >= max) break;
      window.scrollTo(0, y);
      await wait(50);
      y += step;
    }
    window.scrollTo(0, 0);
    await wait(120);
  });

  // img.decode() never settles for an image whose source never resolves, and a
  // mirrored page always has a few of those. Await on a budget and report what
  // did not settle rather than hanging, or silently measuring a page mid-reflow.
  const pendingImages = await page.evaluate(async (budget) => {
    const cap = (p) => Promise.race([p, new Promise((r) => setTimeout(r, budget))]);
    await cap(document.fonts.ready);
    const images = [...document.images];
    let settled = 0;
    const done = () => settled++;
    await cap(Promise.all(images.map((img) => img.decode().then(done, done))));
    return images.length - settled;
  }, 5000);

  // Network may still be settling after the scroll pass. Do not fail on it.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(150);

  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );

  return { page, context, clientWidth, pendingImages };
}

/** Pins every video to a fixed frame so visual comparison is deterministic. */
export async function pinVideos(page, time = 0) {
  await page.evaluate((t) => {
    for (const v of document.querySelectorAll("video")) {
      try {
        v.pause();
        v.currentTime = t;
      } catch {
        /* cross-origin video, nothing to do */
      }
    }
  }, time);
}

// Functions that run inside the page via page.evaluate(). They must be
// self-contained: no imports, no closure over anything in this module.

/**
 * Top-level sections: the direct children of `rootSel`.
 * This is what /wp-diff compares, and it is deliberately shallow. A section that
 * is the right height but in the wrong place is the bug that height-only checks
 * miss, so `top` is reported alongside `height`.
 */
export function collectSections(rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return { error: `Selector not found: ${rootSel}` };

  const label = (el) => {
    const cls = (el.className || "")
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    const text = (el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32);
    const tag = el.tagName.toLowerCase();
    return [cls ? `${tag}.${cls}` : tag, text].filter(Boolean).join(" | ");
  };

  const sections = [...root.children].map((el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      index: i,
      label: label(el),
      tag: el.tagName.toLowerCase(),
      top: Math.round((r.top + window.scrollY) * 100) / 100,
      left: Math.round((r.left + window.scrollX) * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      background: cs.backgroundColor,
      backgroundImage:
        cs.backgroundImage === "none" ? null : cs.backgroundImage,
      padding: [
        cs.paddingTop,
        cs.paddingRight,
        cs.paddingBottom,
        cs.paddingLeft,
      ].join(" "),
      margin: [
        cs.marginTop,
        cs.marginRight,
        cs.marginBottom,
        cs.marginLeft,
      ].join(" "),
    };
  });

  const rootRect = root.getBoundingClientRect();
  return {
    root: rootSel,
    rootHeight: Math.round(rootRect.height * 100) / 100,
    documentHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    count: sections.length,
    sections,
  };
}

/**
 * Deep layout tree: every element that carries its own text, is an image, or
 * paints a background image. Everything else is structural and not worth the
 * bytes. Output goes to a file, never inline: a 3000px section dumped into the
 * conversation is what stalls a porting session.
 */
export function collectTree(rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return { error: `Selector not found: ${rootSel}` };

  const px = (v) => Math.round(parseFloat(v) * 100) / 100 || 0;
  const round = (n) => Math.round(n * 100) / 100;

  const pathOf = (el) => {
    const parts = [];
    let node = el;
    while (node && node !== root && parts.length < 12) {
      const parent = node.parentElement;
      if (!parent) break;
      const i = [...parent.children].indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${i})`);
      node = parent;
    }
    return parts.join(" > ") || ":root";
  };

  const directText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const nodes = [];
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    const cs = getComputedStyle(el);
    const text = directText(el);
    const isImage = el.tagName === "IMG" || el.tagName === "SVG";
    const bgImage = cs.backgroundImage === "none" ? null : cs.backgroundImage;
    if (!text && !isImage && !bgImage) continue;

    nodes.push({
      path: pathOf(el),
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().trim().slice(0, 160) || null,
      text: text ? text.slice(0, 120) : null,
      src: el.getAttribute?.("src") || null,
      href: el.getAttribute?.("href") || null,
      rect: {
        top: round(r.top + window.scrollY),
        left: round(r.left + window.scrollX),
        width: round(r.width),
        height: round(r.height),
      },
      font: {
        family: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        size: px(cs.fontSize),
        // Reported in px even when the author wrote a unitless value, which is
        // the whole point: `leading-normal` is 1.5em and the design rarely wants it.
        lineHeight: cs.lineHeight === "normal" ? "normal" : px(cs.lineHeight),
        weight: cs.fontWeight,
        letterSpacing: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
        transform: cs.textTransform === "none" ? null : cs.textTransform,
      },
      color: cs.color,
      background:
        cs.backgroundColor === "rgba(0, 0, 0, 0)" ? null : cs.backgroundColor,
      backgroundImage: bgImage,
      margin: [
        px(cs.marginTop),
        px(cs.marginRight),
        px(cs.marginBottom),
        px(cs.marginLeft),
      ],
      padding: [
        px(cs.paddingTop),
        px(cs.paddingRight),
        px(cs.paddingBottom),
        px(cs.paddingLeft),
      ],
      display: cs.display,
      position: cs.position === "static" ? null : cs.position,
    });
  }

  return {
    root: rootSel,
    clientWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.scrollHeight,
    count: nodes.length,
    nodes,
  };
}

/**
 * Content only: text, images, links. Kept separate from geometry on purpose.
 * Mixing them produces a dump too large to read in one pass.
 */
export function collectContent(rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return { error: `Selector not found: ${rootSel}` };

  const seen = new Set();
  const text = [];
  for (const el of root.querySelectorAll(
    "h1,h2,h3,h4,h5,h6,p,li,span,a,button,label,strong,em",
  )) {
    const t = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    text.push({ tag: el.tagName.toLowerCase(), text: t });
  }

  const images = [...root.querySelectorAll("img")].map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.alt || null,
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));

  const backgrounds = [];
  for (const el of root.querySelectorAll("*")) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (m && !backgrounds.includes(m[1])) backgrounds.push(m[1]);
  }

  const links = [...root.querySelectorAll("a[href]")].map((a) => ({
    href: a.getAttribute("href"),
    text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
  }));

  return { root: rootSel, text, images, backgrounds, links };
}

/**
 * Interactive widgets present on the page. Inventory only: this lists what
 * behaviour needs reimplementing, it does not port anything.
 */
export function collectInteractive(rootSel) {
  const root = document.querySelector(rootSel) || document.body;
  const found = [];

  const push = (kind, el, detail) => {
    found.push({
      kind,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 120),
      detail: detail || null,
    });
  };

  for (const el of root.querySelectorAll("[data-widget_type]")) {
    push("elementor-widget", el, el.getAttribute("data-widget_type"));
  }
  for (const el of root.querySelectorAll("[data-settings]")) {
    const raw = el.getAttribute("data-settings");
    if (raw && raw.length > 2) push("configured", el, raw.slice(0, 200));
  }
  for (const sel of [
    "form",
    "video",
    "iframe",
    '[role="tablist"]',
    "details",
    "dialog",
  ]) {
    for (const el of root.querySelectorAll(sel))
      push(sel, el, el.getAttribute("src"));
  }
  for (const el of root.querySelectorAll(
    '.swiper, .slick-slider, .owl-carousel, [class*="carousel"]',
  )) {
    push("slider", el);
  }
  for (const el of root.querySelectorAll(
    '[class*="accordion"], [class*="toggle"], [class*="tab-"]',
  )) {
    push("accordion-or-tabs", el);
  }
  for (const el of root.querySelectorAll(
    '[class*="menu-toggle"], [class*="hamburger"], [class*="nav-toggle"]',
  )) {
    push("mobile-menu", el);
  }

  return { root: rootSel, count: found.length, found };
}

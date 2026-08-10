#!/usr/bin/env node
// Design-token census across every mirrored page, plus a starting token file in
// whatever form the target stack wants.
//
// Type tokens are named by their pixel value on purpose. When a measurement
// reads 23px/27.6px you write `text-23 leading-[27.6px]` with no arithmetic in
// between, and a name that cannot drift from what it means.
//
//   node theme.mjs
//   node theme.mjs --page home --viewport 1440
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { launch, prepare } from './browser.mjs';
import { collectTheme } from './dom.mjs';
import { loadConfig, findPage, originalUrl, outPath } from './config.mjs';

const { values } = parseArgs({
  options: {
    page: { type: 'string' },
    viewport: { type: 'string' },
    minCount: { type: 'string', default: '2' },
  },
});

const cfg = loadConfig();
const pages = values.page ? [findPage(cfg, values.page)] : cfg.pages;
const width = Number(values.viewport ?? cfg.viewports?.[0] ?? 1440);
const minCount = Number(values.minCount);

const merged = {
  fontSizes: new Set(),
  sizeLineHeight: new Map(),
  families: new Map(),
  weights: new Map(),
  colors: new Map(),
  backgrounds: new Map(),
  radii: new Map(),
  spacing: new Map(),
  breakpoints: new Set(),
};

const browser = await launch();
try {
  for (const page of pages) {
    const url = originalUrl(cfg, page);
    let data;
    try {
      const { page: tab, context } = await prepare(browser, url, width);
      data = await tab.evaluate(collectTheme, page.originalRoot ?? 'body');
      await context.close();
    } catch (err) {
      console.error(`  skipped ${page.slug}: ${err.message.split('\n')[0]}`);
      continue;
    }
    for (const s of data.fontSizes) merged.fontSizes.add(s);
    for (const b of data.breakpoints) merged.breakpoints.add(b);
    for (const key of ['sizeLineHeight', 'families', 'weights', 'colors', 'backgrounds', 'radii', 'spacing']) {
      for (const { value, count } of data[key]) {
        merged[key].set(value, (merged[key].get(value) ?? 0) + count);
      }
    }
    console.error(`  read ${page.slug}`);
  }
} finally {
  await browser.close();
}

const sizes = [...merged.fontSizes].sort((a, b) => a - b);
const common = (map) =>
  [...map.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]);

const report = {
  pagesRead: pages.length,
  viewport: width,
  fontSizes: sizes,
  sizeLineHeight: common(merged.sizeLineHeight).map(([value, count]) => ({ value, count })),
  families: common(merged.families).map(([value, count]) => ({ value, count })),
  weights: common(merged.weights).map(([value, count]) => ({ value, count })),
  colors: common(merged.colors).map(([value, count]) => ({ value, count })),
  backgrounds: common(merged.backgrounds).map(([value, count]) => ({ value, count })),
  radii: common(merged.radii).map(([value, count]) => ({ value, count })),
  spacing: common(merged.spacing).map(([value, count]) => ({ value, count })),
  breakpoints: [...merged.breakpoints].sort((a, b) => a - b),
};

const file = outPath(cfg, 'theme.json');
writeFileSync(file, JSON.stringify(report, null, 2));

console.log(`\nfont sizes  ${sizes.join(', ')}`);
console.log(`\nsize/line-height pairs (count)`);
for (const { value, count } of report.sizeLineHeight.slice(0, 20)) {
  const flag = value.endsWith('/normal') ? '   ← unresolved, check against the design' : '';
  console.log(`  ${value.padEnd(14)} ${String(count).padStart(4)}${flag}`);
}
console.log(`\nfamilies    ${report.families.map((f) => f.value).join(', ')}`);
console.log(`weights     ${report.weights.map((w) => w.value).join(', ')}`);
console.log(`\ncolors (top 12)`);
for (const { value, count } of report.colors.slice(0, 12)) {
  console.log(`  ${hex(value).padEnd(24)} ${String(count).padStart(4)}`);
}
console.log(`\nbackgrounds (top 8)`);
for (const { value, count } of report.backgrounds.slice(0, 8)) {
  console.log(`  ${hex(value).padEnd(24)} ${String(count).padStart(4)}`);
}
// A builder's real breakpoint shows up as an adjacent pair: one rule at max-width
// 767px and its counterpart at min-width 768px. Isolated values are usually a
// plugin's own defaults and not part of this site's design.
report.boundaries = report.breakpoints.filter((b) => merged.breakpoints.has(b + 1));
console.log(`\nbreakpoints in the source CSS: ${report.breakpoints.join(', ') || 'none'}`);
console.log(`  real boundaries (value and value+1 both present): ${report.boundaries.join(', ') || 'none'}`);
console.log('  the rest are plugin defaults. Measure at each boundary and at boundary+1.');
console.log(`\n→ ${relative(process.cwd(), file)}`);

console.log(`\n--- starting point, ${cfg.css?.mode ?? 'tailwind'} ---\n`);
console.log(emit());

// ===========================================================================

function hex(rgb) {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgb;
  const [, r, g, b, a] = m;
  const h = '#' + [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return a && Number(a) < 1 ? `${h} @${a}` : h;
}

function emit() {
  const mode = cfg.css?.mode ?? 'tailwind';
  const tw = cfg.css?.tailwindVersion ?? 4;
  const typeTokens = sizes.map((s) => `    --text-${String(s).replace('.', '_')}: ${s}px;`).join('\n');
  // Only the real boundaries, and named for the width they switch at.
  const bps = (report.boundaries ?? []).filter((b) => b >= 320 && b <= 1920).map((b) => b + 1);

  if (mode !== 'tailwind') {
    return [
      ':root {',
      typeTokens.split('--text-').join('--text-'),
      report.colors.slice(0, 8).map((c, i) => `    --color-${i + 1}: ${hex(c.value).split(' ')[0]};`).join('\n'),
      '}',
      '',
      '/* Names are placeholders. Rename them for what they mean, not what they look like. */',
    ].join('\n');
  }

  if (tw >= 4) {
    return [
      '@theme {',
      // Numbered, not named. The most-used family is usually body text and the
      // rarest is usually the display face, but that is a judgement about the
      // design, so it belongs to whoever is reading this rather than to a counter.
      report.families
        .slice(0, 3)
        .map((f, i) => `    --font-${i + 1}: '${f.value}', sans-serif;  /* ${f.count} uses, rename me */`)
        .join('\n'),
      '',
      report.colors.slice(0, 6).map((c, i) => `    --color-token-${i + 1}: ${hex(c.value).split(' ')[0]};  /* rename me */`).join('\n'),
      '',
      bps.map((b) => `    --breakpoint-${b}: ${b}px;`).join('\n'),
      '',
      typeTokens,
      '}',
    ].join('\n');
  }

  return [
    '// tailwind.config.js',
    'export default { theme: { extend: {',
    `  fontSize: { ${sizes.map((s) => `'${s}': '${s}px'`).join(', ')} },`,
    `  screens: { ${bps.map((b) => `'bp${b}': '${b}px'`).join(', ')} },`,
    '} } }',
  ].join('\n');
}

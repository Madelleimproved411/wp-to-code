#!/usr/bin/env node
// Static checks for the failures that do not announce themselves.
//
// The worst bug in the project this plugin came from was a type token used in
// three places and never defined. Tailwind emits nothing for an undefined
// token, the element inherits 14px, and because the affected block was
// absolutely positioned every section height stayed correct. It survived a
// full geometry pass and shipped at half size on four pages.
//
// Run this before trusting any measurement.
//
//   node audit.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { loadConfig } from './config.mjs';

const SOURCE_EXT = new Set(['.blade.php', '.php', '.tsx', '.jsx', '.ts', '.js', '.astro', '.vue', '.svelte', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', '.wp-to-code', 'public']);

const cfg = loadConfig();
const root = cfg._root;
const dirs = [cfg.target?.componentDir, cfg.target?.routeDir].filter(Boolean).map((d) => join(root, d));
const searchIn = dirs.filter(existsSync);

if (!searchIn.length) {
  console.error('Nothing to audit. Set target.componentDir in .wp-to-code/config.json.');
  process.exit(1);
}

const files = searchIn.flatMap(walk);
const sources = files.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));
const tokenCss = cfg.css?.tokenFile ? join(root, cfg.css.tokenFile) : null;
const css = tokenCss && existsSync(tokenCss) ? readFileSync(tokenCss, 'utf8') : '';

const findings = [];
const add = (rule, file, line, message) =>
  findings.push({ rule, file: relative(root, file), line, message });

// 1. Type and colour tokens used but never defined -------------------------
if (css) {
  const defined = new Set([...css.matchAll(/--(text|color|font|breakpoint|spacing)-([\w.-]+)\s*:/g)].map((m) => `${m[1]}-${m[2]}`));
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/\b(?:text|bg|border|fill|stroke|font)-((?:text|color|font)?[\w.]+)\b/g)) {
      // Only numeric type tokens and named colours are checkable this way.
      const raw = m[0];
      const numeric = raw.match(/^text-(\d+(?:\.\d+)?)$/);
      if (numeric && !defined.has(`text-${numeric[1]}`)) {
        add('undefined-token', file, lineOf(text, m.index), `${raw} is used but --text-${numeric[1]} is not defined in ${cfg.css.tokenFile}`);
      }
    }
  }
} else if (cfg.css?.mode === 'tailwind') {
  console.error(`  note: css.tokenFile not set or missing, skipping the token check (this is the check that matters most)`);
}

// 2. leading-normal on large text ------------------------------------------
for (const { file, text } of sources) {
  for (const m of text.matchAll(/class(?:Name)?\s*=\s*["'`{]([^"'`]*)["'`}]/g)) {
    const cls = m[1];
    if (!cls.includes('leading-normal')) continue;
    const size = cls.match(/\btext-(\d+)\b/);
    if (size && Number(size[1]) > 18) {
      add('leading-normal', file, lineOf(text, m.index), `leading-normal on text-${size[1]}. That renders at ${(Number(size[1]) * 1.5).toFixed(1)}px; take the line-height from the measurement instead`);
    }
  }
}

// 3. Interpolated class names ----------------------------------------------
for (const { file, text } of sources) {
  for (const m of text.matchAll(/[\w-]+-\[[^\]]*(?:\{\{|\$\{|<\?php|\{\s*\w)[^\]]*\]/g)) {
    add('interpolated-class', file, lineOf(text, m.index), `${m[0]} interpolates a value into a class name. Tailwind scans source text, so this produces no CSS. Use an inline style for genuinely dynamic values.`);
  }
}

// 4. Fixed width plus horizontal padding -----------------------------------
for (const { file, text } of sources) {
  for (const m of text.matchAll(/class(?:Name)?\s*=\s*["'`{]([^"'`]*)["'`}]/g)) {
    const cls = m[1];
    const w = cls.match(/\bw-\[(\d+(?:\.\d+)?)px\]/);
    const pad = cls.match(/\b(p[xlr])-\[(\d+(?:\.\d+)?)px\]/);
    if (w && pad) {
      add('padded-fixed-width', file, lineOf(text, m.index), `w-[${w[1]}px] with ${pad[0]} gives a ${Number(w[1]) - Number(pad[2])}px content box, which rewraps text and changes height. Put the gap on the sibling instead.`);
    }
  }
}

// 5. Arbitrary values that duplicate a defined token ------------------------
if (css) {
  const textTokens = [...css.matchAll(/--text-(\d+(?:\.\d+)?)\s*:/g)].map((m) => Number(m[1]));
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
      const near = textTokens.find((t) => Math.abs(t - Number(m[1])) <= 1);
      if (near) add('duplicate-of-token', file, lineOf(text, m.index), `${m[0]} is within 1px of --text-${near}. Use text-${near}.`);
    }
  }
}

// 6. Classes used exactly once ---------------------------------------------
const classCounts = new Map();
for (const { text } of sources) {
  for (const m of text.matchAll(/class(?:Name)?\s*=\s*["'`{]([^"'`]*)["'`}]/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (/[{}$]/.test(c)) continue;
      classCounts.set(c, (classCounts.get(c) ?? 0) + 1);
    }
  }
}

// --- report ----------------------------------------------------------------

const byRule = {};
for (const f of findings) (byRule[f.rule] ??= []).push(f);

const ORDER = ['undefined-token', 'interpolated-class', 'leading-normal', 'padded-fixed-width', 'duplicate-of-token'];
const TITLES = {
  'undefined-token': 'Tokens used but never defined  (silent: the element inherits, heights can still look right)',
  'interpolated-class': 'Class names built by interpolation  (silent: Tailwind emits nothing)',
  'leading-normal': 'leading-normal on text over 18px',
  'padded-fixed-width': 'Horizontal padding on a fixed-width box',
  'duplicate-of-token': 'Arbitrary values that duplicate a token',
};

console.log(`Audited ${sources.length} files in ${searchIn.map((d) => relative(root, d)).join(', ')}\n`);

for (const rule of ORDER) {
  const list = byRule[rule];
  if (!list?.length) continue;
  console.log(`${TITLES[rule]}`);
  for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.message}`);
  console.log('');
}

const singles = [...classCounts.entries()].filter(([, n]) => n === 1).length;
console.log(`${classCounts.size} distinct classes, ${singles} used exactly once.`);
if (singles > classCounts.size * 0.7) {
  console.log('  A high proportion of single-use classes usually means sections that should be one component are two.');
}

console.log(findings.length ? `\n${findings.length} finding(s).` : '\nNo findings.');
process.exit(findings.length ? 1 : 0);

// ===========================================================================

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (SOURCE_EXT.has(extname(path)) || entry.endsWith('.blade.php')) out.push(path);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

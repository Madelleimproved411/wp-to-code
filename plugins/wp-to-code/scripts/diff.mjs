#!/usr/bin/env node
// The gate. Measures the mirrored original and the port under identical
// conditions and prints a section-by-section table.
//
// Compares position as well as height, on purpose. A section can be the right
// height and in the wrong place, which is how a collapsed margin drags a
// background image 100px up the page while every height check still passes.
//
//   node diff.mjs --page home
//   node diff.mjs --page home --viewport 1440,768,390
//   node diff.mjs --page home --json
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { launch, prepare } from "./browser.mjs";
import { collectSections } from "./dom.mjs";
import {
  loadConfig,
  findPage,
  originalUrl,
  portUrl,
  outPath,
  viewportsFor,
} from "./config.mjs";

const { values } = parseArgs({
  options: {
    page: { type: "string" },
    viewport: { type: "string" },
    tolerance: { type: "string", default: "1" },
    json: { type: "boolean", default: false },
  },
});

if (!values.page) {
  console.error("Usage: diff.mjs --page <slug> [--viewport 1440,768] [--json]");
  process.exit(1);
}

const cfg = loadConfig();
const page = findPage(cfg, values.page);
const tol = Number(values.tolerance);
const viewports = viewportsFor(cfg, values.viewport);

const oUrl = originalUrl(cfg, page);
const pUrl = portUrl(cfg, page);

const browser = await launch();
const report = {
  page: page.slug,
  original: oUrl,
  port: pUrl,
  tolerance: tol,
  viewports: [],
};
let failures = 0;

try {
  for (const width of viewports) {
    const a = await measure(oUrl, page.originalRoot ?? "body", width);
    const b = await measure(pUrl, page.portRoot ?? "body", width);
    const result = compare(a, b, width, tol);
    report.viewports.push(result);
    failures += result.off;
    print(result);
  }
} finally {
  await browser.close();
}

if (values.json) {
  const file = outPath(cfg, "diff", `${page.slug}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\n→ ${relative(process.cwd(), file)}`);
}

console.log(
  failures === 0
    ? `\nAll sections match within ${tol}px across ${viewports.length} viewport(s).`
    : `\n${failures} section(s) off. Not done yet.`,
);
process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------

async function measure(url, root, width) {
  const {
    page: tab,
    context,
    clientWidth,
  } = await prepare(browser, url, width);
  const data = await tab.evaluate(collectSections, root);
  await context.close();
  if (data.error) {
    throw new Error(
      `${data.error}\n  at ${url}\n  Fix originalRoot / portRoot in .wp-to-code/config.json.`,
    );
  }
  data.clientWidth = clientWidth;
  return data;
}

function compare(a, b, width, tol) {
  const rows = [];
  const n = Math.max(a.sections.length, b.sections.length);
  let off = 0;

  for (let i = 0; i < n; i++) {
    const o = a.sections[i];
    const p = b.sections[i];
    if (!o || !p) {
      rows.push({
        index: i,
        label: (o ?? p).label,
        missing: o ? "port" : "original",
      });
      off++;
      continue;
    }
    const dh = Math.round((p.height - o.height) * 100) / 100;
    const dt = Math.round((p.top - o.top) * 100) / 100;
    const ok = Math.abs(dh) <= tol && Math.abs(dt) <= tol;
    if (!ok) off++;
    rows.push({
      index: i,
      label: o.label,
      originalHeight: o.height,
      portHeight: p.height,
      originalTop: o.top,
      portTop: p.top,
      dh,
      dt,
      ok,
    });
  }

  return {
    viewport: width,
    clientWidth: { original: a.clientWidth, port: b.clientWidth },
    count: { original: a.sections.length, port: b.sections.length },
    rootHeight: { original: a.rootHeight, port: b.rootHeight },
    documentHeight: { original: a.documentHeight, port: b.documentHeight },
    off,
    rows,
  };
}

function print(r) {
  const { original: ow, port: pw } = r.clientWidth;
  console.log(`\n${r.viewport}px`);
  if (ow !== pw) {
    console.log(
      `  clientWidth differs: original ${ow}, port ${pw}. Results are not comparable until this matches.`,
    );
  }
  if (r.count.original !== r.count.port) {
    console.log(
      `  section count: original ${r.count.original}, port ${r.count.port}`,
    );
  }

  const pad = (v, w) => String(v).padStart(w);
  console.log(
    `   #  ${pad("height", 15)}  ${pad("top", 15)}   verdict   section`,
  );
  for (const row of r.rows) {
    if (row.missing) {
      console.log(
        `  ${pad(row.index, 2)}  ${pad("—", 15)}  ${pad("—", 15)}   MISSING in ${row.missing}   ${row.label}`,
      );
      continue;
    }
    const h = `${pad(row.originalHeight, 6)} vs ${pad(row.portHeight, 6)}`;
    const t = `${pad(row.originalTop, 6)} vs ${pad(row.portTop, 6)}`;
    const verdict = row.ok
      ? "MATCH  "
      : [
          row.dh ? `Δh ${row.dh > 0 ? "+" : ""}${row.dh}` : "",
          row.dt ? `Δtop ${row.dt > 0 ? "+" : ""}${row.dt}` : "",
        ]
          .filter(Boolean)
          .join(" ");
    console.log(
      `  ${pad(row.index, 2)}  ${h}  ${t}   ${verdict.padEnd(9)} ${row.label}`,
    );
  }
  console.log(
    `  root ${r.rootHeight.original} vs ${r.rootHeight.port}   ` +
      `document ${r.documentHeight.original} vs ${r.documentHeight.port}`,
  );
}

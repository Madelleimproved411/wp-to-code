#!/usr/bin/env node
// Dumps a layout tree, content list, section list or interactive inventory to a
// file, then prints a summary short enough to read inline.
//
//   node measure.mjs --page home --side original
//   node measure.mjs --page home --side port --mode content
//   node measure.mjs --url http://127.0.0.1:4321/home.html --root ".elementor-42"
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { launch, prepare } from "./browser.mjs";
import {
  collectSections,
  collectTree,
  collectContent,
  collectInteractive,
} from "./dom.mjs";
import {
  loadConfig,
  findPage,
  originalUrl,
  portUrl,
  outPath,
} from "./config.mjs";

const COLLECTORS = {
  tree: collectTree,
  sections: collectSections,
  content: collectContent,
  interactive: collectInteractive,
};

const { values } = parseArgs({
  options: {
    page: { type: "string" },
    side: { type: "string", default: "original" },
    url: { type: "string" },
    root: { type: "string" },
    viewport: { type: "string" },
    mode: { type: "string", default: "tree" },
    out: { type: "string" },
  },
});

const collect = COLLECTORS[values.mode];
if (!collect) {
  console.error(
    `Unknown --mode ${values.mode}. Use: ${Object.keys(COLLECTORS).join(", ")}`,
  );
  process.exit(1);
}

let cfg = null;
let page = null;
try {
  cfg = loadConfig();
} catch (err) {
  if (!values.url) throw err;
}

if (values.page) page = findPage(cfg, values.page);

const side = values.side === "port" ? "port" : "original";
const url =
  values.url ?? (side === "port" ? portUrl(cfg, page) : originalUrl(cfg, page));
const root =
  values.root ??
  (side === "port" ? page?.portRoot : page?.originalRoot) ??
  "body";
const width = Number(values.viewport ?? cfg?.viewports?.[0] ?? 1440);

const browser = await launch();
let result;
try {
  const {
    page: tab,
    context,
    clientWidth,
  } = await prepare(browser, url, width);
  result = await tab.evaluate(collect, root);
  result.url = url;
  result.viewport = width;
  result.clientWidth = clientWidth;
  await context.close();
} finally {
  await browser.close();
}

if (result.error) {
  console.error(`${result.error}\n  url: ${url}`);
  console.error(
    "Set originalRoot / portRoot for this page in .wp-to-code/config.json.",
  );
  process.exit(1);
}

const name = values.page ?? "adhoc";
const file =
  values.out ??
  outPath(cfg ?? {}, "measure", `${name}-${side}-${width}-${values.mode}.json`);
writeFileSync(file, JSON.stringify(result, null, 2));

console.log(
  `${values.mode} · ${side} · ${width}px (client ${result.clientWidth}px)`,
);
console.log(`  ${url}`);
console.log(`  → ${relative(process.cwd(), file)}`);

if (values.mode === "tree") {
  const sizes = [...new Set(result.nodes.map((n) => n.font.size))].sort(
    (a, b) => a - b,
  );
  const leadings = result.nodes.filter(
    (n) => n.font.lineHeight === "normal",
  ).length;
  console.log(`  ${result.count} nodes, document ${result.documentHeight}px`);
  console.log(`  font sizes: ${sizes.join(", ")}`);
  if (leadings)
    console.log(
      `  ${leadings} nodes at line-height:normal (verify each against the design)`,
    );
} else if (values.mode === "sections") {
  console.log(`  ${result.count} sections, root ${result.rootHeight}px`);
  for (const s of result.sections) {
    console.log(
      `  ${String(s.index).padStart(2)}  ${String(s.height).padStart(7)}px  top ${String(s.top).padStart(7)}  ${s.label}`,
    );
  }
} else if (values.mode === "content") {
  console.log(
    `  ${result.text.length} text nodes, ${result.images.length} images, ${result.backgrounds.length} background images, ${result.links.length} links`,
  );
} else {
  console.log(`  ${result.count} interactive elements`);
  const byKind = {};
  for (const f of result.found) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  for (const [k, v] of Object.entries(byKind))
    console.log(`  ${String(v).padStart(3)}  ${k}`);
}

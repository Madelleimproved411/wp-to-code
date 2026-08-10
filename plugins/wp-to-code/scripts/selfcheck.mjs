#!/usr/bin/env node
// End-to-end check of the diff gate. Serves two fixture pages, runs diff.mjs
// against them, and asserts on the result.
//
// The second case is the one that matters: a section with a negative top margin
// keeps every height identical and moves two sections up the page. A height-only
// comparison passes it. This asserts that the gate does not.
//
//   node selfcheck.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));

const shell = (body) => `<!doctype html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font:16px/1.5 system-ui}</style>
</head><body><main>${body}</main></body></html>`;

const SECTIONS = shell(`
  <section style="height:200px;background:#eee">A</section>
  <section style="height:300px;background:#ddd">B</section>
  <section style="height:150px;background:#ccc">C</section>`);

// Identical heights, two sections dragged 40px up. This is the margin-collapse
// shape of bug, reduced to its smallest form.
const SHIFTED = shell(`
  <section style="height:200px;background:#eee">A</section>
  <section style="height:300px;background:#ddd;margin-top:-40px">B</section>
  <section style="height:150px;background:#ccc">C</section>`);

const serve = (html) =>
  new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });

const runDiff = (cwd) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(HERE, "diff.mjs"), "--page", "fixture"],
      {
        cwd,
        env: process.env,
      },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

async function scenario(name, originalHtml, portHtml) {
  const a = await serve(originalHtml);
  const b = await serve(portHtml);
  const dir = mkdtempSync(join(tmpdir(), "wp-to-code-"));
  mkdirSync(join(dir, ".wp-to-code"), { recursive: true });
  writeFileSync(
    join(dir, ".wp-to-code", "config.json"),
    JSON.stringify({
      mirror: { port: a.port },
      port: { devUrl: `http://127.0.0.1:${b.port}` },
      viewports: [1440],
      pages: [
        {
          slug: "fixture",
          targetRoute: "/",
          originalRoot: "main",
          portRoot: "main",
        },
      ],
    }),
  );

  const result = await runDiff(dir);
  a.server.close();
  b.server.close();
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n--- ${name} (exit ${result.code}) ---\n${result.out.trim()}`);
  return result;
}

const same = await scenario("identical pages", SECTIONS, SECTIONS);
assert.equal(same.code, 0, "identical pages must pass the gate");
assert.match(same.out, /All sections match/);
assert.equal(
  (same.out.match(/MATCH/g) ?? []).length,
  3,
  "all three sections should match",
);

const shifted = await scenario(
  "same heights, shifted position",
  SECTIONS,
  SHIFTED,
);
assert.equal(shifted.code, 1, "a position-only bug must fail the gate");
assert.match(shifted.out, /Δtop -40/, "the 40px shift must be reported");
assert.doesNotMatch(shifted.out, /Δh /, "no height should have changed");
assert.match(shifted.out, /2 section\(s\) off/, "B and C both move");

console.log(
  "\nselfcheck passed: the gate catches a position-only regression that height alone misses.",
);

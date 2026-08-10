#!/usr/bin/env node
// Static file server for the mirrored original. Deliberately dumb: the whole
// point is that the mirror is a plain directory on a known port, with no
// framework in front of it, so the port under construction can be any stack.
//
//   node serve.mjs                 # reads dir and port from .wp-to-code/config.json
//   node serve.mjs --port 4321 --dir ./somewhere
import { createServer } from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { parseArgs } from "node:util";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export function startServer(root, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    // normalize() collapses any ../ before it can escape the mirror directory.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    let file = join(root, rel);

    if (existsSync(file) && statSync(file).isDirectory())
      file = join(file, "index.html");
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404");
      return;
    }

    res.writeHead(200, {
      "content-type":
        TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// Run directly rather than imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: { port: { type: "string" }, dir: { type: "string" } },
  });
  const { loadConfig } = await import("./config.mjs");
  let root = values.dir;
  let port = Number(values.port ?? 0);
  if (!root || !port) {
    const cfg = loadConfig();
    root = root ?? join(cfg._root, cfg.mirror?.dir ?? ".wp-to-code/mirror");
    port = port || (cfg.mirror?.port ?? 4321);
  }
  await startServer(root, port);
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
  console.log("Leave this running while you diff. Ctrl-C to stop.");
}

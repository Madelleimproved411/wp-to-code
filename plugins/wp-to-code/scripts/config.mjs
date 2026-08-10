// Reads .wp-to-code/config.json from the project being ported and resolves
// the two URLs every command needs: the mirrored original, and the port.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

export const CONFIG_DIR = ".wp-to-code";
export const CONFIG_PATH = `${CONFIG_DIR}/config.json`;

export function loadConfig(cwd = process.cwd()) {
  const path = resolve(cwd, CONFIG_PATH);
  if (!existsSync(path)) {
    throw new Error(`No ${CONFIG_PATH} in ${cwd}. Run /wp-init first.`);
  }
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  cfg._root = cwd;
  return cfg;
}

export function findPage(cfg, slug) {
  const page = cfg.pages?.find((p) => p.slug === slug);
  if (!page) {
    const known = (cfg.pages ?? []).map((p) => p.slug).join(", ") || "(none)";
    throw new Error(`Unknown page "${slug}". Configured pages: ${known}`);
  }
  return page;
}

/** URL of the mirrored original, served by the static server on mirror.port. */
export function originalUrl(cfg, page) {
  const port = cfg.mirror?.port ?? 4321;
  return `http://127.0.0.1:${port}/${page.slug}.html`;
}

/** URL of the page in the stack being built. */
export function portUrl(cfg, page) {
  const base = (cfg.port?.devUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const route = page.targetRoute ?? "/";
  return route === "/" ? `${base}/` : `${base}${route}`;
}

export function outPath(cfg, ...parts) {
  const path = resolve(cfg._root ?? process.cwd(), CONFIG_DIR, ...parts);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function viewportsFor(cfg, arg) {
  if (arg) {
    return String(arg)
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v > 0);
  }
  return cfg.viewports?.length ? cfg.viewports : [1440];
}

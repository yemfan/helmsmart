#!/usr/bin/env node
/**
 * Rasterizes the RealtorBoss brand SVGs into the PNG icon sizes the app
 * references (favicon, apple-touch, PWA, JSON-LD, OG fallbacks).
 *
 *   realtorboss-icon.svg  → navy app-icon tile (flattened on navy, no
 *                           transparent corners → safe for apple-touch/PWA)
 *   realtorboss-mark.svg  → transparent mark (keeps alpha)
 *
 * Run after editing either SVG:  node scripts/generate-brand-icons.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const brand = path.join(appRoot, "public", "brand", "realtorboss");

const iconSvg = readFileSync(path.join(brand, "realtorboss-icon.svg"));
const markSvg = readFileSync(path.join(brand, "realtorboss-mark.svg"));

const NAVY = { r: 11, g: 31, b: 68, alpha: 1 };

async function render(svg, size, out, { flatten = false } = {}) {
  let img = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (flatten) img = img.flatten({ background: NAVY });
  await img.png().toFile(out);
  console.log("wrote", path.relative(appRoot, out), `${size}×${size}`);
}

const tasks = [
  // App-icon tile (solid navy, no transparent corners)
  [iconSvg, 64, path.join(brand, "realtorboss-icon-64.png"), { flatten: true }],
  [iconSvg, 180, path.join(brand, "realtorboss-icon-180.png"), { flatten: true }],
  [iconSvg, 512, path.join(brand, "realtorboss-icon-512.png"), { flatten: true }],
  [iconSvg, 256, path.join(appRoot, "app", "icon.png"), { flatten: true }],
  [iconSvg, 180, path.join(appRoot, "app", "apple-icon.png"), { flatten: true }],
  // Standalone mark (transparent)
  [markSvg, 512, path.join(brand, "realtorboss-mark-512.png")],
];

for (const [svg, size, out, opts] of tasks) {
  await render(svg, size, out, opts);
}
console.log("done.");

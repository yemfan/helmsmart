#!/usr/bin/env node
/**
 * Rasterizes the RealtyBoss brand SVGs into the PNG icon sizes the app
 * references (favicon, apple-touch, PWA, JSON-LD, OG fallbacks).
 *
 *   realtyboss-icon.svg  → navy app-icon tile (flattened on navy, no
 *                           transparent corners → safe for apple-touch/PWA)
 *   realtyboss-mark.svg  → transparent mark (keeps alpha)
 *
 * Run after editing either SVG:  node scripts/generate-brand-icons.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const brand = path.join(appRoot, "public", "brand", "realtyboss");
// Sibling Expo app — keep its launcher icons in sync with the web brand.
const mobileAssets = path.resolve(appRoot, "..", "leadsmart-mobile", "assets");

const iconSvg = readFileSync(path.join(brand, "realtyboss-icon.svg"));
const markSvg = readFileSync(path.join(brand, "realtyboss-mark.svg"));
const glyphSvg = readFileSync(path.join(brand, "realtyboss-glyph.svg"));

// Flatten color = the light-blue tile (#CFE5FA), so rounded-corner transparency
// fills with the tile color instead of leaving navy/black corners.
const TILE_BG = { r: 207, g: 229, b: 250, alpha: 1 };

async function render(svg, size, out, { flatten = false } = {}) {
  let img = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (flatten) img = img.flatten({ background: TILE_BG });
  await img.png().toFile(out);
  console.log("wrote", path.relative(appRoot, out), `${size}×${size}`);
}

const tasks = [
  // App-icon tile (solid navy, no transparent corners)
  [iconSvg, 64, path.join(brand, "realtyboss-icon-64.png"), { flatten: true }],
  [iconSvg, 180, path.join(brand, "realtyboss-icon-180.png"), { flatten: true }],
  [iconSvg, 512, path.join(brand, "realtyboss-icon-512.png"), { flatten: true }],
  [iconSvg, 256, path.join(appRoot, "app", "icon.png"), { flatten: true }],
  [iconSvg, 180, path.join(appRoot, "app", "apple-icon.png"), { flatten: true }],
  // Standalone mark (transparent)
  [markSvg, 512, path.join(brand, "realtyboss-mark-512.png")],
  // Expo mobile app icon (iOS/Android base) — opaque 1024 tile.
  [iconSvg, 1024, path.join(mobileAssets, "icon.png"), { flatten: true }],
];

for (const [svg, size, out, opts] of tasks) {
  await render(svg, size, out, opts);
}

// Android adaptive-icon foreground: transparent 1024 with the mark inset into
// the launcher safe zone (the OS masks ~25% off each edge + supplies the
// background color from app.json → adaptiveIcon.backgroundColor: #CFE5FA).
const ADAPTIVE = 1024;
const INNER = 700;
const PAD = Math.round((ADAPTIVE - INNER) / 2);
await sharp(glyphSvg, { density: 384 })
  .resize(INNER, INNER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(mobileAssets, "adaptive-icon.png"));
console.log("wrote", "../leadsmart-mobile/assets/adaptive-icon.png", "1024 (foreground)");

console.log("done.");

#!/usr/bin/env node
/**
 * Rasterizes the CloseBoss brand into the PNG icon sizes the app references
 * (favicon, apple-touch, PWA, JSON-LD, OG fallbacks) and keeps the sibling
 * Expo app's launcher icons in sync.
 *
 * Source of truth is the mascot artwork (raster):
 *   realtyboss-mascot.png       → opaque full-bleed purple tile (app icons,
 *                                  favicon, apple-touch, PWA, mobile launcher)
 *   realtyboss-mascot-mark.png  → the mascot on a transparent background
 *                                  (standalone mark + Android adaptive foreground)
 *
 * Run after replacing either master:  node scripts/generate-brand-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const brand = path.join(appRoot, "public", "brand", "realtyboss");
// Sibling Expo app — keep its launcher icons in sync with the web brand.
const mobileAssets = path.resolve(appRoot, "..", "leadsmart-mobile", "assets");

const tileMaster = path.join(brand, "realtyboss-mascot.png"); // opaque tile
const markMaster = path.join(brand, "realtyboss-mascot-mark.png"); // transparent

async function resizePng(src, size, out) {
  await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  console.log("wrote", path.relative(appRoot, out), `${size}×${size}`);
}

const tasks = [
  // Opaque app-icon tile (the mascot already has no transparent corners)
  [tileMaster, 64, path.join(brand, "realtyboss-icon-64.png")],
  [tileMaster, 180, path.join(brand, "realtyboss-icon-180.png")],
  [tileMaster, 512, path.join(brand, "realtyboss-icon-512.png")],
  [tileMaster, 256, path.join(appRoot, "app", "icon.png")], // favicon
  [tileMaster, 180, path.join(appRoot, "app", "apple-icon.png")],
  // Standalone mark (transparent)
  [markMaster, 512, path.join(brand, "realtyboss-mark-512.png")],
  // Expo mobile launcher icon (iOS/Android base) — opaque 1024 tile.
  [tileMaster, 1024, path.join(mobileAssets, "icon.png")],
];

for (const [src, size, out] of tasks) {
  await resizePng(src, size, out);
}

// Android adaptive-icon foreground: transparent 1024 with the mascot inset into
// the launcher safe zone (the OS masks ~25% off each edge + supplies the
// background color from app.json → adaptiveIcon.backgroundColor).
const ADAPTIVE = 1024;
const INNER = 700;
const PAD = Math.round((ADAPTIVE - INNER) / 2);
await sharp(markMaster)
  .resize(INNER, INNER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(mobileAssets, "adaptive-icon.png"));
console.log("wrote", "../leadsmart-mobile/assets/adaptive-icon.png", "1024 (foreground)");

console.log("done.");

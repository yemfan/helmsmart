#!/usr/bin/env node
/**
 * Rasterizes the CloseBoss brand into the PNG icon sizes the app references
 * (favicon, apple-touch, PWA, JSON-LD, OG fallbacks) and keeps the sibling
 * Expo app's launcher icons in sync.
 *
 * Source of truth is ONE file:
 *   closeboss-mark-master.png  → the CloseBoss C-mark (gold "C" inside the
 *                                navy node ring) on a transparent background,
 *                                full-bleed with no baked-in padding.
 *
 * Everything below is derived from it, so the mark can never drift between
 * surfaces. That drift is not hypothetical: this script previously pointed at
 * `closeboss-mascot.png`, the retired hexagon-of-six-people mark, long after
 * the icons themselves had been regenerated from the C-mark. Running it would
 * have silently reverted the favicon, the apple-touch icon and the Expo
 * launcher icon to the old brand. If you replace the mark, replace the master
 * and re-run — never hand-edit an output.
 *
 * Transparent vs. opaque is deliberate, not incidental:
 *   - favicon / standalone mark  → transparent, so it sits on any surface.
 *   - apple-touch + Expo launcher → flattened onto white, because iOS and
 *     Android composite a transparent icon onto black.
 *   - closeboss-tile-512         → flattened onto white; this is the file to
 *     upload to developer portals (TikTok, Meta, Google) that show the icon on
 *     a light card and reject transparency-dependent art.
 *
 * Run after replacing the master:  node scripts/generate-brand-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const brand = path.join(appRoot, "public", "brand", "closeboss");
// Sibling Expo app — keep its launcher icons in sync with the web brand.
const mobileAssets = path.resolve(appRoot, "..", "leadsmart-mobile", "assets");

const master = path.join(brand, "closeboss-mark-master.png");

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * @param {number} size square edge in px
 * @param {string} out absolute destination path
 * @param {{ opaque?: boolean }} [opts] flatten onto white (for OS launchers and
 *   developer portals, which composite transparency onto black or reject it)
 */
async function render(size, out, { opaque = false } = {}) {
  let pipeline = sharp(master).resize(size, size, {
    fit: "contain",
    background: TRANSPARENT,
    kernel: "lanczos3",
  });
  if (opaque) pipeline = pipeline.flatten({ background: WHITE });
  await pipeline.png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", path.relative(appRoot, out), `${size}x${size}`, opaque ? "(white tile)" : "(transparent)");
}

const tasks = [
  // Web — favicon + standalone mark keep their alpha.
  [256, path.join(appRoot, "app", "icon.png"), {}], // favicon
  [64, path.join(brand, "closeboss-icon-64.png"), {}],
  [180, path.join(brand, "closeboss-icon-180.png"), {}],
  [512, path.join(brand, "closeboss-icon-512.png"), {}],
  [512, path.join(brand, "closeboss-mark-512.png"), {}], // referenced by CloseBossLogo
  // Opaque tiles — iOS home screen, and portal uploads that show it on a card.
  [180, path.join(appRoot, "app", "apple-icon.png"), { opaque: true }],
  [512, path.join(brand, "closeboss-tile-512.png"), { opaque: true }],
  // Expo mobile launcher icon (iOS/Android base).
  [1024, path.join(mobileAssets, "icon.png"), { opaque: true }],
];

for (const [size, out, opts] of tasks) {
  await render(size, out, opts);
}

// Android adaptive-icon foreground: transparent 1024 with the mark inset into
// the launcher safe zone (the OS masks ~25% off each edge + supplies the
// background color from app.json → adaptiveIcon.backgroundColor).
const ADAPTIVE = 1024;
const INNER = 700;
const PAD = Math.round((ADAPTIVE - INNER) / 2);
await sharp(master)
  .resize(INNER, INNER, { fit: "contain", background: TRANSPARENT, kernel: "lanczos3" })
  .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: TRANSPARENT })
  .png({ compressionLevel: 9 })
  .toFile(path.join(mobileAssets, "adaptive-icon.png"));
console.log("wrote", "../leadsmart-mobile/assets/adaptive-icon.png", "1024 (foreground)");

console.log("done.");

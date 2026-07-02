/**
 * Rasterize the RealtyBoss brand mark into the PNG icon set.
 *
 * Reads  public/brand/realtyboss/realtyboss-mark.svg
 * Writes public/brand/realtyboss/realtyboss-icon-{64,180,512}.png
 *        (mark centered on a white rounded-rect tile, like the
 *        approved app-icon concept) and realtyboss-mark-512.png
 *        (transparent, no tile).
 *
 * Usage (from apps/leadsmartai): node ./scripts/generate-realtyboss-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brandDir = join(__dirname, "..", "public", "brand", "realtyboss");
mkdirSync(brandDir, { recursive: true });

const markSvg = readFileSync(join(brandDir, "realtyboss-mark.svg"), "utf8");

/** Wrap the mark in a white rounded tile (12% corner radius, hairline border). */
function tileSvg(size) {
  const r = Math.round(size * 0.18);
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  // Inline the mark's content scaled into the padded area.
  const body = markSvg
    .replace(/<svg[^>]*>/, "")
    .replace("</svg>", "");
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${r}" fill="#FFFFFF" stroke="#1E3A66" stroke-opacity="0.18" stroke-width="2"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 200})" fill="none">${body}</g>
</svg>`;
}

for (const size of [64, 180, 512]) {
  const png = await sharp(Buffer.from(tileSvg(size)), { density: 300 })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(join(brandDir, `realtyboss-icon-${size}.png`), png);
  console.log(`realtyboss-icon-${size}.png`);
}

// Transparent mark (no tile) at 512 for general use.
const mark = await sharp(Buffer.from(markSvg), { density: 300 })
  .resize(512, 512)
  .png()
  .toBuffer();
writeFileSync(join(brandDir, "realtyboss-mark-512.png"), mark);
console.log("realtyboss-mark-512.png");

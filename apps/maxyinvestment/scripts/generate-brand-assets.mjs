/**
 * Regenerates the favicon, apple icon, and social share image from the source
 * logo. Run after changing public/maxy-logo.png:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Output is committed — this is not part of the build. Text is rasterized here
 * with a local serif so the deployed page needs no font fetching at runtime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = join(root, "public", "maxy-logo.png");

const NAVY = "#0b1f44";
const RED = "#d62828";
const MUTED = "#687386";

/**
 * Trim the source art's generous padding, then key its background out to
 * transparent. The art's "white" is rgb(254,254,254), not pure white, so
 * compositing it straight onto a white canvas leaves a visible grey box.
 */
async function trimmedLogo() {
  const { data, info } = await sharp(LOGO)
    .trim({ threshold: 10 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248) {
      data[i + 3] = 0; // near-white -> transparent
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

async function icon(size, out, padding) {
  const inner = size - padding * 2;
  const mark = await sharp(await trimmedLogo())
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: mark, top: padding, left: padding }])
    .png()
    .toFile(join(root, out));
  console.log(`  ${out} — ${size}x${size}`);
}

async function openGraph() {
  const W = 1200;
  const H = 630;

  const mark = await sharp(await trimmedLogo())
    .resize(132, 132, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  // Georgia is the same serif family the site falls back to, so the share card
  // reads as the site even though the page itself uses Playfair Display.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="${W}" height="10" fill="${RED}"/>
    <text x="80" y="292" font-family="Georgia, serif" font-size="21" font-weight="bold"
          fill="${RED}" letter-spacing="3.2">INVESTMENT &#183; TECHNOLOGY &#183; REAL ESTATE</text>
    <text x="80" y="382" font-family="Georgia, serif" font-size="72" font-weight="bold"
          fill="${NAVY}">Building intelligent</text>
    <text x="80" y="462" font-family="Georgia, serif" font-size="72" font-weight="bold"
          fill="${NAVY}">businesses.</text>
    <line x1="80" y1="524" x2="1120" y2="524" stroke="#e6eaf0" stroke-width="2"/>
    <text x="80" y="566" font-family="Georgia, serif" font-size="24"
          fill="${MUTED}">maxyinvestment.com</text>
  </svg>`;

  await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
    .composite([
      { input: Buffer.from(svg), top: 0, left: 0 },
      { input: mark, top: 74, left: 80 },
      { input: Buffer.from(nameSvg()), top: 96, left: 232 },
    ])
    .png()
    .toFile(join(root, "app", "opengraph-image.png"));
  console.log("  app/opengraph-image.png — 1200x630");
}

function nameSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="90">
    <text x="0" y="62" font-family="Georgia, serif" font-size="46" font-weight="bold"
          fill="${NAVY}">MAXY Investment Inc.</text>
  </svg>`;
}

console.log("Generating brand assets from public/maxy-logo.png…");
await icon(64, "app/icon.png", 4);
await icon(180, "app/apple-icon.png", 16);
await openGraph();

const before = readFileSync(LOGO).length;
console.log(`\nSource logo ${(before / 1024).toFixed(0)}KB (kept for <Image>, served resized by Next).`);
writeFileSync(join(root, "app", ".assets-generated"), "");

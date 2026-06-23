import { NextResponse } from "next/server";
import { getPublicOpenHouseBySlug } from "@/lib/open-houses/publicService";

export const runtime = "nodejs";
// Short revalidate — we want "Add to Home Screen" to pick up fresh
// property-address labels within seconds of a schedule edit.
export const revalidate = 30;

/**
 * Per-kiosk PWA manifest. Served at
 * `/oh/[slug]/kiosk/manifest.json`.
 *
 * iOS Safari ignores most of this (it keys off `apple-touch-icon` +
 * `apple-mobile-web-app-capable` meta tags in the page <head>), but
 * Android Chrome + desktop browsers will use it for "install app".
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const info = await getPublicOpenHouseBySlug(slug).catch(() => null);

  const shortName = "Open House";
  const fullName = info?.propertyAddress
    ? `Open House — ${info.propertyAddress}`
    : "Open House Sign-In";

  const manifest = {
    name: fullName,
    short_name: shortName,
    description:
      "Visitor sign-in kiosk. Opens full-screen on iPad after adding to Home Screen.",
    start_url: `/oh/${slug}/kiosk`,
    scope: `/oh/${slug}/`,
    display: "standalone",
    orientation: "landscape",
    background_color: "#0f172a", // slate-900 — matches the kiosk chrome
    theme_color: "#0f172a",
    icons: [
      {
        src: "/brand/realtorboss/realtorboss-icon-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/realtorboss/realtorboss-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=30",
      "Content-Type": "application/manifest+json",
    },
  });
}

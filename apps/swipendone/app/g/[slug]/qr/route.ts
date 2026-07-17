import { NextResponse } from "next/server";
import { qrPngBuffer, qrSvgString } from "@/lib/qr";

export const runtime = "nodejs";

// GET /g/[slug]/qr        → PNG (1200px, print-ready)
// GET /g/[slug]/qr?f=svg  → SVG
// Add ?download=1 to force a file download.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("f") === "svg" ? "svg" : "png";
  const download = url.searchParams.get("download") === "1";

  const disposition = download
    ? `attachment; filename="swipendone-${slug}.${format}"`
    : "inline";

  if (format === "svg") {
    const svg = await qrSvgString(slug);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "Content-Disposition": disposition,
      },
    });
  }

  const png = await qrPngBuffer(slug);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": disposition,
    },
  });
}

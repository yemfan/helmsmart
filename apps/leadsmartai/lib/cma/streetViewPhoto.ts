import "server-only";

/**
 * Resolves a single photo of the subject property for the professional
 * CMA report. Two sources, tried in order by the route:
 *
 *   1. fetchListingPhoto(url) — the actual listing photo the AI found on
 *      the web (snapshot.subject.photoUrl). The real home, when available.
 *   2. fetchSubjectPhoto(address) — a Street View shot. Always-available
 *      fallback when there's no listing photo.
 *
 * Both return a base64 data URL + format jsPDF can embed, or null so the
 * report degrades to a clean placeholder band. jsPDF only embeds JPEG/PNG
 * reliably, so WebP/other formats are rejected (→ fall through to the next
 * source).
 *
 * Street View key resolution: prefer GOOGLE_MAPS_SERVER_KEY (unrestricted
 * server key), fall back to the public maps key. A referrer-restricted
 * public key fails server-side; that's why we degrade gracefully.
 */

export type PhotoFormat = "JPEG" | "PNG";

export type SubjectPhoto = {
  /** data:image/...;base64,... — ready for jsPDF addImage. */
  dataUrl: string;
  /** jsPDF image format token. */
  format: PhotoFormat;
};

const PHOTO_W = 640;
const PHOTO_H = 400;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // skip absurdly large images

function resolveKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

/** Map a content-type / magic bytes to a jsPDF format, or null if unsupported. */
function detectFormat(contentType: string | null, buf: Buffer): PhotoFormat | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "JPEG";
  if (ct.includes("png")) return "PNG";
  // Fall back to magic bytes when the server sends a generic/missing type.
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "JPEG";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "PNG";
  }
  return null; // WebP, GIF, SVG, HTML error page, etc.
}

/**
 * Fetch + validate an arbitrary listing photo URL the AI surfaced. Returns
 * null on any failure (bad URL, non-image, WebP, hotlink block, timeout).
 */
export async function fetchListingPhoto(
  url: string | null | undefined,
): Promise<SubjectPhoto | null> {
  const u = url?.trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;

  try {
    const res = await fetch(u, {
      cache: "no-store",
      // A browser-ish UA + referer avoids some CDN hotlink blocks.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadSmartCMA/1.0)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) return null;
    const format = detectFormat(res.headers.get("content-type"), buf);
    if (!format) return null;
    const mime = format === "PNG" ? "image/png" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, format };
  } catch {
    return null;
  }
}

// Browser-ish UA — some listing sites serve their og:image HTML only to
// what looks like a real browser (and 403 a bare fetch).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 8000;

/** Pull the og:image (or twitter:image) URL out of listing-page HTML. */
function extractOgImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        return new URL(m[1], baseUrl).toString();
      } catch {
        /* malformed — try next pattern */
      }
    }
  }
  return null;
}

/**
 * Fetch a listing page (Redfin / Realtor / Zillow / MLS), pull its
 * og:image, and return the embedded photo. Returns null when the page
 * blocks us (403/429), has no og:image, or the image isn't JPEG/PNG —
 * the route then falls back to Street View.
 */
export async function fetchPhotoFromListingPage(
  pageUrl: string | null | undefined,
): Promise<SubjectPhoto | null> {
  const u = pageUrl?.trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
    let html: string;
    let finalUrl: string;
    try {
      const res = await fetch(u, {
        cache: "no-store",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      });
      if (!res.ok) return null;
      finalUrl = res.url || u;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_HTML_BYTES) return null;
      html = buf.toString("utf8");
    } finally {
      clearTimeout(timer);
    }

    const ogImage = extractOgImage(html, finalUrl);
    if (!ogImage) return null;
    return await fetchListingPhoto(ogImage);
  } catch {
    return null;
  }
}

/**
 * Street View Static photo of the subject. Checks the metadata endpoint
 * first — the API returns a gray "no imagery" placeholder (HTTP 200) when
 * a location has no coverage, so metadata is the only reliable signal.
 */
export async function fetchSubjectPhoto(
  address: string,
): Promise<SubjectPhoto | null> {
  const key = resolveKey();
  const loc = address.trim();
  if (!key || !loc) return null;

  try {
    const metaUrl =
      "https://maps.googleapis.com/maps/api/streetview/metadata" +
      `?size=${PHOTO_W}x${PHOTO_H}&location=${encodeURIComponent(loc)}&key=${key}`;
    const metaRes = await fetch(metaUrl, { cache: "no-store" });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json().catch(() => null)) as
      | { status?: string }
      | null;
    if (!meta || meta.status !== "OK") return null;

    const imgUrl =
      "https://maps.googleapis.com/maps/api/streetview" +
      `?size=${PHOTO_W}x${PHOTO_H}&location=${encodeURIComponent(loc)}` +
      `&fov=80&pitch=0&key=${key}`;
    const imgRes = await fetch(imgUrl, { cache: "no-store" });
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length === 0) return null;

    return { dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`, format: "JPEG" };
  } catch {
    return null;
  }
}

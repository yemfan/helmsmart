import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Best-effort "a picture per story" for the weekly newsletter.
 *
 * For each digest item we try to attach a story image: fetch the item's
 * source_url HTML, parse its Open Graph (`og:image`, falling back to
 * `twitter:image`) meta tag, download that image, and upload it to the PUBLIC
 * `newsletter-images` Supabase bucket. The item's public URL is returned.
 *
 * EVERYTHING here is best-effort and safe: any failure (no og:image, non-image
 * content-type, too big, timeout, fetch/upload error) resolves to null and the
 * caller leaves image_url null. One item failing must NEVER abort the digest, so
 * attachItemImages() catches per-item and never throws.
 */

const BUCKET = "newsletter-images";
const HTML_TIMEOUT_MS = 6000;
const HTML_MAX_BYTES = 2 * 1024 * 1024; // ~2MB of HTML is plenty for <head> meta.
const IMAGE_TIMEOUT_MS = 8000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // ≤5MB image.
const USER_AGENT =
  "Mozilla/5.0 (compatible; RealtyBossNewsletterBot/1.0; +https://www.realtybossai.com)";

/** Item shape this module needs — just its source URL. */
type ImageableItem = {
  source_url?: string | null;
  image_url?: string | null;
};

/**
 * Attach a best-effort image to each item in place (sets item.image_url). Runs
 * items sequentially to stay gentle on origins and Supabase. Never throws; a
 * per-item failure leaves that item's image_url null and continues.
 */
export async function attachItemImages(
  items: ImageableItem[],
  weekOf: string,
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  if (!hasServiceRole()) return; // no service role → can't upload; skip cleanly.

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const src = typeof item?.source_url === "string" ? item.source_url : "";
    if (!isHttpUrl(src)) continue;
    try {
      const url = await fetchStoreItemImage(src, weekOf, i);
      if (url) item.image_url = url;
    } catch {
      // Best-effort: swallow and leave image_url null.
    }
  }
}

/**
 * The og:image → download → store → public-url flow for a single item. Returns
 * the public URL on success, or null on any failure. Never throws.
 */
async function fetchStoreItemImage(
  sourceUrl: string,
  weekOf: string,
  index: number,
): Promise<string | null> {
  const imageUrl = await extractOgImage(sourceUrl);
  if (!imageUrl) return null;

  const downloaded = await downloadImage(imageUrl);
  if (!downloaded) return null;

  return uploadImage(downloaded.bytes, downloaded.contentType, weekOf, index);
}

// ── og:image extraction ──────────────────────────────────────────────────────

/**
 * GET the source HTML (timeout, byte cap, UA set) and parse the og:image /
 * twitter:image meta URL, resolved against the page URL. Returns null on any
 * failure.
 */
async function extractOgImage(pageUrl: string): Promise<string | null> {
  const html = await fetchHtml(pageUrl);
  if (!html) return null;

  const raw =
    findMetaContent(html, "og:image") ||
    findMetaContent(html, "og:image:url") ||
    findMetaContent(html, "twitter:image") ||
    findMetaContent(html, "twitter:image:src");
  if (!raw) return null;

  // Resolve relative/protocol-relative URLs against the page.
  try {
    const resolved = new URL(decodeHtmlEntities(raw), pageUrl).toString();
    return isHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** GET HTML with timeout + byte cap. Returns the (possibly truncated) body or null. */
async function fetchHtml(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok || !res.body) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct && !/text\/html|application\/xhtml/i.test(ct)) return null;
    return await readCapped(res.body, HTML_MAX_BYTES, "utf-8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find a meta tag's content by property/name (e.g. "og:image"), tolerant of
 * attribute order (content before or after property/name). Returns the first
 * non-empty match or null.
 */
function findMetaContent(html: string, key: string): string | null {
  // Only scan the head-ish top of the doc; og tags live there and it bounds work.
  const head = html.slice(0, 512 * 1024);
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match <meta ... property|name="og:image" ... content="URL" ...> in either order.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${esc}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${esc}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(head);
    if (m && m[1] && m[1].trim()) return m[1].trim();
  }
  return null;
}

// ── image download ───────────────────────────────────────────────────────────

type DownloadedImage = { bytes: Uint8Array; contentType: string };

/**
 * Download an image URL with timeout + byte cap, verifying the content-type is
 * image/*. Returns bytes + content-type, or null on any failure.
 */
async function downloadImage(imageUrl: string): Promise<DownloadedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(imageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
    });
    if (!res.ok || !res.body) return null;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    // Reject obviously-too-big responses early when a length is advertised.
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > IMAGE_MAX_BYTES) return null;
    const bytes = await readCappedBytes(res.body, IMAGE_MAX_BYTES);
    if (!bytes || bytes.byteLength === 0) return null;
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── upload to bucket ─────────────────────────────────────────────────────────

/**
 * Upload the image bytes to the public newsletter-images bucket at
 * `${weekOf}/${index}.<ext>` (upsert) and return the public URL, or null.
 */
async function uploadImage(
  bytes: Uint8Array,
  contentType: string,
  weekOf: string,
  index: number,
): Promise<string | null> {
  const ext = extForContentType(contentType);
  const path = `${weekOf}/${index}.${ext}`;
  try {
    const { error } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabaseServer.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    return typeof publicUrl === "string" && isHttpUrl(publicUrl) ? publicUrl : null;
  } catch {
    return null;
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function extForContentType(ct: string): string {
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  if (ct.includes("svg")) return "svg";
  return "img";
}

/** Read a stream up to maxBytes and decode as text (used for HTML). */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  encoding: string,
): Promise<string | null> {
  const bytes = await readCappedBytes(body, maxBytes);
  if (!bytes) return null;
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return null;
  }
}

/** Read a stream, stopping once maxBytes have been collected. */
async function readCappedBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total > maxBytes) {
          // Over cap for HTML we still keep what we have (head meta is early);
          // for images this means "too big" — caller checks byteLength.
          break;
        }
      }
    }
  } catch {
    return null;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  if (chunks.length === 0) return null;
  const out = new Uint8Array(Math.min(total, maxBytes + chunkOverflowSlack(chunks)));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= out.length) break;
    const room = out.length - offset;
    const slice = c.byteLength > room ? c.subarray(0, room) : c;
    out.set(slice, offset);
    offset += slice.byteLength;
  }
  return out.subarray(0, offset);
}

/** Allow the final chunk to overflow the cap slightly rather than truncating mid-read. */
function chunkOverflowSlack(chunks: Uint8Array[]): number {
  return chunks.length ? chunks[chunks.length - 1].byteLength : 0;
}

/** Minimal HTML-entity decode for og:image URLs (&amp; is the common one). */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&");
}

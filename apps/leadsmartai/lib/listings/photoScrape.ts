import "server-only";

/**
 * Listing photo scraper. The big portals (Zillow/Realtor/Redfin/Homes) 403 a
 * plain server fetch and CAPTCHA a headless browser, but they all embed the full
 * photo set in the rendered page's JSON, and the photos themselves live on public
 * CDNs that don't block. So: render the page through a scrape API (residential
 * proxy + JS render), then regex the CDN URLs out and upsize to full resolution.
 *
 * Provider = ScraperAPI (simple GET, free tier). Its basic call already rotates
 * proxies that get past Zillow's bot-wall (verified: a plain call returns the
 * full server-rendered page with all photos — no JS render / premium tier
 * needed). Gated on SCRAPER_API_KEY (SCRAPINGBEE_API_KEY still read as a
 * fallback so an existing env var keeps working); scrapeConfigured() is false
 * until one is set, so callers degrade gracefully.
 *
 * RIGHTS: intended for an agent pulling THEIR OWN listing's photos (MLS/IDX terms
 * generally permit the listing agent to use them). The UI must attest that.
 */

const SCRAPERAPI = "https://api.scraperapi.com/";
const MAX_PHOTOS = 20;

function scraperKey(): string | undefined {
  return process.env.SCRAPER_API_KEY?.trim() || process.env.SCRAPINGBEE_API_KEY?.trim();
}

export function scrapeConfigured(): boolean {
  return Boolean(scraperKey());
}

/** Fetch a URL's rendered HTML via ScraperAPI (gets past the portal bot-wall). */
export async function fetchRenderedHtml(url: string): Promise<string> {
  const key = scraperKey();
  if (!key) throw new Error("Photo pull isn't configured (missing SCRAPER_API_KEY).");

  // Basic call — ScraperAPI returns the full server-rendered page (its
  // __NEXT_DATA__ carries every photo URL), so no render/premium is required.
  const params = new URLSearchParams({ api_key: key, url, country_code: "us" });
  const res = await fetch(`${SCRAPERAPI}?${params.toString()}`, { method: "GET" });
  const html = await res.text();
  // Diagnostic: status + size only. NEVER log/return the response body — a
  // provider auth error can echo the api key back, which would leak the secret.
  console.log(`[photoScrape] status=${res.status} htmlLen=${html.length} url=${url.slice(0, 80)}`);
  if (!res.ok) {
    const hint =
      res.status === 401
        ? " — check SCRAPER_API_KEY is a valid ScraperAPI key."
        : res.status === 403
          ? " — the target blocked the scrape (or a gated feature)."
          : res.status === 429
            ? " — ScraperAPI is out of credits / rate-limited."
            : "";
    throw new Error(`Photo pull failed (${res.status})${hint}`);
  }
  return html;
}

/**
 * Extract full-resolution listing photo URLs from rendered HTML. Zillow is
 * handled precisely (dedupe by the 32-hex photo hash, then request the full-res
 * suffix); other portals get a best-effort pass over their known CDN hosts.
 */
export function extractPhotoUrls(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };

  // ── Zillow: photos.zillowstatic.com/fp/{hash}-{suffix}.{ext}
  const zHashes = new Set<string>();
  for (const m of html.matchAll(/photos\.zillowstatic\.com\/fp\/([a-f0-9]{32})-/g)) zHashes.add(m[1]);
  for (const h of zHashes) add(`https://photos.zillowstatic.com/fp/${h}-uncropped_scaled_within_1536_1152.jpg`);

  // ── Redfin: ssl.cdn-redfin.com/photo/.../bigphoto/.../{id}_N.jpg — take as-is,
  // prefer the "genLdpUrl" / bigphoto variants already at a usable size.
  if (out.length === 0) {
    for (const m of html.matchAll(/https?:\/\/ssl\.cdn-redfin\.com\/photo\/[^\s"'\\]+?\.(?:jpg|webp)/gi)) add(m[0]);
  }

  // ── Realtor.com: ap.rdcpix.com/{...}/{id}-{suffix}.jpg — dedupe by base id,
  // request a large variant.
  if (out.length === 0) {
    const rSeen = new Set<string>();
    for (const m of html.matchAll(/https?:\/\/ap\.rdcpix\.com\/[^\s"'\\]+?\/([a-z0-9]+)s?-[a-z0-9]+\.(?:jpg|webp)/gi)) {
      const base = m[1];
      if (!rSeen.has(base)) {
        rSeen.add(base);
        add(m[0]);
      }
    }
  }

  // ── Homes.com + generic real-estate CDNs (last resort).
  if (out.length === 0) {
    for (const m of html.matchAll(/https?:\/\/[^\s"'\\]*?(?:homes\.com|maxebrdc|listingphotos)[^\s"'\\]*?\.(?:jpg|webp)/gi)) add(m[0]);
  }

  return out.slice(0, MAX_PHOTOS);
}

/** Convenience: render + extract in one call. */
export async function scrapeListingPhotos(url: string): Promise<string[]> {
  const html = await fetchRenderedHtml(url);
  return extractPhotoUrls(html);
}

/** Strip tags → visible-ish text for AI fact extraction (cheap, no huge JSON). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

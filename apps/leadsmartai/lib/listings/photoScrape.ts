import "server-only";

/**
 * Listing photo scraper. The big portals (Zillow/Realtor/Redfin/Homes) 403 a
 * plain server fetch and CAPTCHA a headless browser, but they all embed the full
 * photo set in the rendered page's JSON, and the photos themselves live on public
 * CDNs that don't block. So: render the page through a scrape API (residential
 * proxy + JS render), then regex the CDN URLs out and upsize to full resolution.
 *
 * Provider = ScrapingBee (simple GET, has a free tier). Swap by changing
 * fetchRenderedHtml. Gated on SCRAPINGBEE_API_KEY — scrapeConfigured() is false
 * until it's set, so callers degrade gracefully.
 *
 * RIGHTS: intended for an agent pulling THEIR OWN listing's photos (MLS/IDX terms
 * generally permit the listing agent to use them). The UI must attest that.
 */

const SCRAPINGBEE = "https://app.scrapingbee.com/api/v1/";
const MAX_PHOTOS = 20;

export function scrapeConfigured(): boolean {
  return Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
}

/** Render a URL to HTML via the scrape API (gets past the portal bot-wall). */
export async function fetchRenderedHtml(url: string): Promise<string> {
  const key = process.env.SCRAPINGBEE_API_KEY?.trim();
  if (!key) throw new Error("Photo pull isn't configured (missing SCRAPINGBEE_API_KEY).");

  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: "true",
    // Zillow/Realtor/Redfin run aggressive bot detection (PerimeterX/HUMAN).
    // stealth_proxy is ScrapingBee's toughest tier (residential + anti-bot),
    // the one they recommend for sites this hard. Costs more credits, but a
    // basic/premium render just returns a block page on Zillow.
    stealth_proxy: "true",
    wait: "4000",
    block_resources: "false", // need the JSON/images referenced
    country_code: "us",
  });
  const res = await fetch(`${SCRAPINGBEE}?${params.toString()}`, { method: "GET" });
  const html = await res.text();
  // Diagnostic: status + size only. NEVER log/return the response body — on an
  // auth error ScrapingBee echoes the api key back in the JSON, so surfacing the
  // body would leak the secret into logs and the client-facing warnings.
  console.log(`[photoScrape] status=${res.status} htmlLen=${html.length} url=${url.slice(0, 80)}`);
  if (!res.ok) {
    const hint =
      res.status === 401
        ? " — check SCRAPINGBEE_API_KEY is a valid key."
        : res.status === 402
          ? " — ScrapingBee is out of credits."
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

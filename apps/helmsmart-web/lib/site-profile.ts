/**
 * Read the website the owner typed at sign-up, so Emma can be briefed from it.
 *
 * Until now that field was collected and never used by anything. Reading it is
 * the whole point of asking — but it means this server fetches a URL a stranger
 * supplied, which is the classic server-side request forgery hole: `http://169.
 * 254.169.254/`, `http://localhost:54322/`, an internal hostname, or an
 * innocuous public name whose DNS answer is `10.0.0.5`. There was no fetcher in
 * this app to copy, so the guards are written out here rather than assumed:
 *
 *   1. https only. No http, no file:, no gopher:, no data:.
 *   2. Every hop is resolved with DNS and every resolved address is checked
 *      against the private, loopback, link-local and reserved ranges — before
 *      the socket is opened, and again for each redirect. A public name that
 *      resolves inward is rejected on the address, not the name.
 *   3. Redirects are followed by hand, at most three, each one re-validated.
 *      `redirect: "follow"` would let hop two land anywhere.
 *   4. The body is capped at 1 MB and the whole thing at a few seconds.
 *   5. Only `text/html` and `text/plain` are read at all.
 *
 * And it is never load-bearing. Every failure returns a reason; the caller
 * falls back to what the owner typed, and then to the defaults. A site that is
 * down, slow, JavaScript-only or hostile costs the owner nothing but the draft.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Total time for the whole fetch, redirects included. */
const TIMEOUT_MS = 6000;
/** Bytes of body we will read. Anything past this is dropped, not an error. */
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
/** Characters of extracted text handed to the model. */
export const MAX_TEXT_CHARS = 12_000;

export type SiteReadFailure =
  | "empty"
  | "bad-url"
  | "not-https"
  | "blocked-host"
  | "dns-failed"
  | "too-many-redirects"
  | "http-error"
  | "unsupported-type"
  | "no-text"
  | "unreachable";

export type SiteRead =
  | { ok: true; url: string; title: string | null; text: string }
  | { ok: false; reason: SiteReadFailure };

/**
 * The URL to fetch, or null. A bare `acme.com` becomes `https://acme.com` —
 * people type the domain, not the scheme — but an explicit `http://` is
 * REJECTED rather than upgraded: silently changing someone's scheme to one
 * that happens to pass the guard is how a guard stops meaning anything.
 */
export function normalizeSiteUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url;
}

/** Hostnames we refuse before asking DNS anything. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Names that only ever resolve inside a network boundary.
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  // A bare label ("intranet") has no public authority behind it.
  if (!h.includes(".")) return true;
  // A literal address in the host position skips DNS, so check it here too.
  if (isIP(h)) return isPrivateAddress(h);
  return false;
}

/**
 * Whether an IP is one this server must not be talked into reaching: loopback,
 * the RFC1918 and CGNAT ranges, link-local (which is where cloud metadata
 * lives), and the reserved blocks.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) return isPrivateV6(ip);
  return true; // not an address we can reason about — refuse
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments / 192.0.2.0 TEST-NET
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateV6(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::" || h === "::1") return true;
  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms carry a v4 address.
  const mapped = h.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (h.startsWith("fe80") || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true; // link-local
  }
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("ff")) return true; // multicast
  if (h.startsWith("::ffff:")) return true; // any other mapped form
  return false;
}

/** Every address this hostname resolves to is public. Fails closed. */
async function hostResolvesPublicly(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return !isPrivateAddress(bare);
  try {
    const addresses = await lookup(bare, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * Visible text from an HTML document: scripts, styles, templates, SVG and
 * comments dropped, tags collapsed, entities of the handful that matter
 * decoded. Deliberately crude — the output is read by a model, not a browser,
 * and pulling in a parser to brief a receptionist is not a trade worth making.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** The `<title>`, if the document has one worth repeating. */
export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  const text = m ? htmlToText(m[1]).trim() : "";
  return text || null;
}

/** Read at most MAX_BYTES of the body, then stop pulling. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return (await res.text()).slice(0, MAX_BYTES);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    // Stop the transfer whether we finished or hit the cap.
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    joined.set(c.subarray(0, Math.min(c.byteLength, total - at)), at);
    at += c.byteLength;
    if (at >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

/**
 * Fetch the owner's site and return its text. Never throws.
 *
 * `signal` is an overall deadline for the whole walk, redirects included, so a
 * server that answers each hop slowly cannot hold the setup step open.
 */
export async function readSiteText(input: string): Promise<SiteRead> {
  if (!input || !input.trim()) return { ok: false, reason: "empty" };

  let url = normalizeSiteUrl(input);
  if (!url) {
    // Tell the two apart: a typed `http://` is a scheme problem, not a typo.
    const bad = input.trim();
    return { ok: false, reason: /^https?:/i.test(bad) && !/^https:/i.test(bad) ? "not-https" : "bad-url" };
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:") return { ok: false, reason: "not-https" };
    if (isBlockedHostname(url.hostname)) return { ok: false, reason: "blocked-host" };
    if (!(await hostResolvesPublicly(url.hostname))) return { ok: false, reason: "dns-failed" };

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          // Named honestly. A crawler that lies about who it is deserves the
          // block it eventually gets.
          "user-agent": "HelmSmartSetupBot/1.0 (+https://www.helmsmart.ai)",
          accept: "text/html,text/plain;q=0.9",
          "accept-language": "en;q=0.9,*;q=0.5",
        },
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "http-error" };
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { ok: false, reason: "bad-url" };
      }
      url = next;
      continue; // re-validated at the top of the loop, which is the point
    }

    if (!res.ok) return { ok: false, reason: "http-error" };

    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !type.includes("text/html") && !type.includes("text/plain") && !type.includes("application/xhtml")) {
      return { ok: false, reason: "unsupported-type" };
    }

    let raw: string;
    try {
      raw = await readCapped(res);
    } catch {
      return { ok: false, reason: "unreachable" };
    }

    const text = htmlToText(raw).slice(0, MAX_TEXT_CHARS);
    if (text.replace(/\s/g, "").length < 40) return { ok: false, reason: "no-text" };
    return { ok: true, url: url.toString(), title: htmlTitle(raw), text };
  }

  return { ok: false, reason: "too-many-redirects" };
}

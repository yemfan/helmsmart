/**
 * Pure caption builder for the auto-post-listing-to-Facebook flow.
 *
 * Takes a listing transaction's display fields and returns a
 * deterministic caption string. No AI generation in v1 — agents value
 * predictability over creativity for posts that go to their public
 * page. A future PR can layer in an AI variant (similar to PR #162's
 * buyer-outreach AI path) once we have signal on what tone agents
 * want.
 *
 * Caption shape (FB allows ~63k chars; we stay under 600 for
 * scroll-friendly posts):
 *
 *   {hook} {address} — {city}, {state}
 *   • {beds} bed | {baths} bath | {sqft} sqft
 *   • Listed at {formatted_price}
 *   {agent_signoff}
 *   #realestate #{city_hashtag} #{state_hashtag}
 *
 * Empty fields collapse cleanly — a listing with no sqft just drops
 * that bullet, doesn't render "—" or "0".
 */

/**
 * Where the property actually is in its life, as far as the transaction knows.
 *
 * The caption opened "Just listed!" for every property regardless — including
 * one under contract with a closing date three weeks out, which the AI draft
 * then published as #JustListed. Advertising a property that is spoken for as
 * newly on the market is a claim an agent makes under their own licence.
 */
export type ListingStatus = "on_market" | "under_contract" | "sold";

export type ListingCaptionInput = {
  /** Free-form headline override. When omitted, defaults to a generic
   *  "Just listed!" hook. */
  hook?: string | null;
  propertyAddress: string;
  city: string | null;
  state: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listPrice: number | null;
  /** Agent name used in the sign-off ("— Sam at Pacific Realty").
   *  Falls back to a neutral close when missing. */
  agentName: string | null;
  agentBrokerage: string | null;
  /** Omitted only by callers that genuinely cannot tell; see DEFAULT_HOOK. */
  listingStatus?: ListingStatus | null;
};

export type ListingCaptionResult = {
  caption: string;
  /** Tags rendered into the caption — exposed for tests + a future
   *  per-platform variant that wants the tags as separate metadata. */
  hashtags: string[];
};

/**
 * Openings that state the status rather than assuming it. Each is standard
 * US practice and each is checkable against the transaction.
 */
const STATUS_HOOKS: Record<ListingStatus, string> = {
  on_market: "Now on the market",
  under_contract: "Under contract",
  sold: "Just sold",
};

/** Only for callers that pass no status at all. */
const DEFAULT_HOOK = "Just listed!";
const HARD_CAP_CHARS = 1500;

export function buildListingCaption(input: ListingCaptionInput): ListingCaptionResult {
  const lines: string[] = [];

  const hook =
    (input.hook ?? "").trim() ||
    (input.listingStatus ? STATUS_HOOKS[input.listingStatus] : DEFAULT_HOOK);

  const locationSuffix = formatLocationSuffix(input.city, input.state);
  const headline = locationSuffix
    ? `${hook} ${input.propertyAddress.trim()} — ${locationSuffix}`
    : `${hook} ${input.propertyAddress.trim()}`;
  lines.push(headline);

  const detailsBullet = formatDetailsBullet(input.beds, input.baths, input.sqft);
  if (detailsBullet) lines.push(`• ${detailsBullet}`);

  if (input.listPrice != null && Number.isFinite(input.listPrice) && input.listPrice > 0) {
    lines.push(`• Listed at ${formatMoney(input.listPrice)}`);
  }

  const signoff = formatSignoff(input.agentName, input.agentBrokerage);
  if (signoff) {
    lines.push("");
    lines.push(signoff);
  }

  const hashtags = buildHashtags(input.city, input.state);
  if (hashtags.length > 0) {
    lines.push("");
    lines.push(hashtags.map((t) => `#${t}`).join(" "));
  }

  let caption = lines.join("\n");
  if (caption.length > HARD_CAP_CHARS) {
    caption = `${caption.slice(0, HARD_CAP_CHARS - 1).trimEnd()}…`;
  }

  return { caption, hashtags };
}

function formatLocationSuffix(city: string | null, state: string | null): string {
  const c = (city ?? "").trim();
  const s = (state ?? "").trim();
  if (c && s) return `${c}, ${s}`;
  return c || s;
}

function formatDetailsBullet(
  beds: number | null,
  baths: number | null,
  sqft: number | null,
): string {
  const parts: string[] = [];
  if (beds != null && Number.isFinite(beds) && beds > 0) {
    parts.push(`${beds} bed`);
  }
  if (baths != null && Number.isFinite(baths) && baths > 0) {
    parts.push(`${baths} bath`);
  }
  if (sqft != null && Number.isFinite(sqft) && sqft > 0) {
    parts.push(`${sqft.toLocaleString()} sqft`);
  }
  return parts.join(" | ");
}

function formatSignoff(name: string | null, brokerage: string | null): string {
  const n = (name ?? "").trim();
  const b = (brokerage ?? "").trim();
  if (n && b) return `— ${n} at ${b}`;
  if (n) return `— ${n}`;
  if (b) return `— ${b}`;
  return "";
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Build the hashtag list. Always includes #realestate; per-city and
 * per-state tags collapse to a single token (no spaces, lowercased,
 * non-alphanumerics stripped). Two-letter state codes lowercase to
 * match the convention (#tx, #ca).
 */
function buildHashtags(city: string | null, state: string | null): string[] {
  const tags = ["realestate"];
  const cityTag = sanitizeTag(city);
  if (cityTag) tags.push(cityTag);
  const stateTag = sanitizeTag(state);
  if (stateTag) tags.push(stateTag);
  return tags;
}

function sanitizeTag(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

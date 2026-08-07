/**
 * Public listings types — shared between server (`service.ts`) and
 * client components (e.g. ListingDetailClient).
 *
 * Lives in its own file because `service.ts` imports
 * `server-only`, which means anything imported from it can't be
 * pulled into a client bundle — even pure type imports trigger the
 * guard at bundle time.
 */

import type { TransactionStatus } from "@/lib/transactions/types";

/** Status enum on the listings table. Six values vs TransactionStatus's four. */
export type ListingStatus =
  | "draft"
  | "active"
  | "pending"
  | "contracted"
  | "withdrawn"
  | "expired";

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  active: "Active",
  pending: "Pending",
  contracted: "Under contract",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/**
 * Hard ceiling on cinematic clips per video ad. Each clip is a paid fal render,
 * so this caps a big photo set from fanning into a surprise bill. Shared by the
 * server (adVideo.ts) and the panel UI so both agree on the max. At 5–10s per
 * clip this allows roughly a 60–120s tour.
 */
export const LISTING_AD_MAX_CLIPS = 12;

/** Per-clip lengths the agent can pick (Kling image-to-video supports 5 or 10). */
export const LISTING_AD_CLIP_SECONDS = [5, 10] as const;
export type ListingAdClipSeconds = (typeof LISTING_AD_CLIP_SECONDS)[number];

/** List-page row shape returned by `listListingsForAgent`. */
export type ListingListItem = {
  /** Listings table primary key. */
  id: string;
  /**
   * Back-link to the listing's source transaction. Populated for
   * Phase 1-backfilled rows; null for listings created post-Phase 2c.
   */
  transactionId: string | null;
  property_address: string;
  city: string | null;
  state: string | null;
  /** Mapped from listings.status (6 values) into TransactionStatus
   *  (4 values) for backwards compat with the existing badge UI.
   *  Phase 2b/2c may switch to ListingStatus directly. */
  status: TransactionStatus;
  list_price: number | null;
  listing_start_date: string | null;
  closing_date: string | null;
  closing_date_actual: string | null;
  showings_total: number;
  showings_upcoming: number;
  last_showing_at: string | null;
};

/** Detail-page shape returned by `getListingById`. */
export type ListingDetail = {
  id: string;
  transactionId: string | null;
  agent_id: string | number;
  contact_id: string;
  contactName: string | null;
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  mls_url: string | null;
  list_price: number | null;
  listing_start_date: string | null;
  listing_end_date: string | null;
  status: ListingStatus;
  commission_pct: number | null;
  seller_update_enabled: boolean;
  seller_update_last_sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  showings_total: number;
  showings_upcoming: number;
  last_showing_at: string | null;
  // ── Ad facts (source material for the listing → video ad) ──────────
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  property_description: string | null;
  /** Short selling-point strings; defaults to [] at the DB level. */
  highlights: string[];
  /** Listing photo URLs (MLS pull or upload); defaults to [] at the DB level. */
  photo_urls: string[];
  /** 'mls_url' | 'manual' | null (never pulled). */
  ad_facts_source: string | null;
  ad_facts_confidence: number | null;
  ad_facts_updated_at: string | null;
  /** Cinematic clip URLs (fal image-to-video from the photos); defaults to []. */
  ad_clip_urls: string[];
  ad_clips_updated_at: string | null;
  // ── Finished branded video ad (Phase 2b) ──────────────────────────
  ad_reel_url: string | null;
  ad_reel_caption: string | null;
  ad_reel_render_id: string | null;
  ad_reel_render_bucket: string | null;
  /** idle | rendering | ready | failed | null. */
  ad_reel_status: string | null;
  ad_reel_error: string | null;
  ad_reel_updated_at: string | null;
  // ── AI script + voiceover (Phase 2d) ──────────────────────────────
  /** Seconds per clip used for the current ad (5 or 10); null = legacy 5. */
  ad_clip_seconds: number | null;
  /** AI-written, agent-editable narration script for the voiceover. */
  ad_reel_script: string | null;
  /** Finished ad with voiceover muxed on; preferred over ad_reel_url. */
  ad_reel_voiced_url: string | null;
};

/** The AI-extracted (or manually filled) listing ad facts. Everything nullable. */
export type ListingAdFacts = {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  price: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  highlights: string[];
  photoUrls: string[];
  /** 0-1 — how confident the extractor is the facts were read correctly. */
  confidence: number;
  /** Free-form notes when the page was blocked, thin, or non-listing. */
  warnings: string[];
};

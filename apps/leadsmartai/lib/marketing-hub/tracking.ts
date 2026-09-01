/**
 * Which analytics tags a hub should render, and whether it should render them
 * at all.
 *
 * Three questions, and they are genuinely separate:
 *
 *   1. Has the agent configured an id?
 *   2. Does their plan include it?  — Meta Pixel is Premium; GA4 is not.
 *   3. Has the visitor asked not to be tracked?
 *
 * (3) OUTRANKS THE OTHER TWO. Global Privacy Control is a machine-readable
 * opt-out that California treats as a valid request, and the Meta Pixel is
 * exactly the kind of sharing it covers. Honouring it is a browser check and a
 * branch; not honouring it is a regulatory position nobody here decided to
 * take. GPC suppresses the Pixel — the third-party ad tracker — and leaves
 * GA4, which is first-party measurement of the agent's own site.
 *
 * WHY PIXEL IS PAID AND GA4 IS NOT. The line is "are you running ads", which
 * is a real signal of willingness to pay. GA4 is table stakes — every website
 * builder includes it on its entry plan, and gating it invites "I can't even
 * see my own traffic?", an objection that costs more than the upgrades it
 * wins. The Pixel is also where the build cost sits: event mapping,
 * deduplication against server events, hashed identifiers.
 *
 * Pure: no I/O and no DOM, so every rule above is testable directly.
 */

import { meetsPlan, type PlanTier } from "@/lib/billing/planRank";

/** The tier at which an agent's own Meta Pixel becomes available. */
export const PIXEL_MIN_PLAN: PlanTier = "premium";

/** Meta Pixel ids are 15-16 digits. */
export const META_PIXEL_RE = /^[0-9]{15,16}$/;
/** GA4 measurement ids look like G-XXXXXXXXXX. */
export const GA_MEASUREMENT_RE = /^G-[A-Z0-9]{6,12}$/;

export type TrackingConfig = {
  metaPixelId: string | null;
  gaMeasurementId: string | null;
};

export type TrackingDecision = {
  /** Render the Meta Pixel with this id, or null for not at all. */
  metaPixelId: string | null;
  /** Render GA4 with this id, or null. */
  gaMeasurementId: string | null;
  /** Why the pixel is absent, for the settings screen — never for the visitor. */
  pixelSuppressedBy: "not_configured" | "plan" | "privacy_signal" | null;
};

/** Trim and upper-case a GA id; Meta ids are digits and need only trimming. */
export function normalizeMetaPixelId(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, "");
  return v || null;
}

export function normalizeGaMeasurementId(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
  return v || null;
}

export function isValidMetaPixelId(raw: string | null | undefined): boolean {
  const v = normalizeMetaPixelId(raw);
  return v !== null && META_PIXEL_RE.test(v);
}

export function isValidGaMeasurementId(raw: string | null | undefined): boolean {
  const v = normalizeGaMeasurementId(raw);
  return v !== null && GA_MEASUREMENT_RE.test(v);
}

/**
 * What to actually put on the page.
 *
 * @param config the agent's stored ids.
 * @param plan the tier resolved across every plan source — see planRank.ts for
 *   why that is not a single column read.
 * @param privacySignal true when the visitor's browser sent Global Privacy
 *   Control, or the agent's own consent gate said no.
 */
export function decideTracking(
  config: TrackingConfig,
  plan: PlanTier,
  privacySignal: boolean,
): TrackingDecision {
  const pixel = normalizeMetaPixelId(config.metaPixelId);
  const ga = normalizeGaMeasurementId(config.gaMeasurementId);

  // Order matters only for the REASON reported back to the agent. A privacy
  // signal is checked first so an agent on the right plan with a valid id is
  // told the truth — "a visitor opted out" — rather than being sent to look
  // for a configuration problem that does not exist.
  let suppressedBy: TrackingDecision["pixelSuppressedBy"] = null;
  if (privacySignal) suppressedBy = "privacy_signal";
  else if (!pixel || !META_PIXEL_RE.test(pixel)) suppressedBy = "not_configured";
  else if (!meetsPlan(plan, PIXEL_MIN_PLAN)) suppressedBy = "plan";

  return {
    metaPixelId: suppressedBy === null ? pixel : null,
    // GA4 is first-party measurement of the agent's own site and is not
    // suppressed by the plan. An invalid id is dropped rather than emitted:
    // a malformed tag fails silently in the browser, and the agent concludes
    // the feature is broken rather than the value mistyped.
    gaMeasurementId: ga && GA_MEASUREMENT_RE.test(ga) ? ga : null,
    pixelSuppressedBy: suppressedBy,
  };
}

/**
 * Is this request asking not to be tracked?
 *
 * `Sec-GPC: 1` is the header form of Global Privacy Control. Read server-side
 * so the decision is made before any tag reaches the page — checking it in the
 * browser would mean the script had already loaded.
 */
export function hasPrivacySignal(headers: {
  get(name: string): string | null;
}): boolean {
  return String(headers.get("sec-gpc") ?? "").trim() === "1";
}

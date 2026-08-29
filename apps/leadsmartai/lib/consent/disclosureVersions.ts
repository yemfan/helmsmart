/**
 * Pinned identifiers for the EXACT consent-disclosure text shown on
 * each public form. Bump the version (and snapshot the prior text in
 * `archive/` when you do) whenever the on-screen disclosure changes
 * materially — e.g. adding/removing the "consent is not a condition"
 * line, changing "customer care + marketing" to a narrower scope, etc.
 *
 * The audit table (`inbound_contact_requests.consent_disclosure_version`)
 * stores whichever value was current at submit time, so we can prove
 * what the consenting party saw even after the live form is edited.
 */

/**
 * /contact form (LeadSmart AI marketing site).
 *
 * v2.0 — 2026-05-25 — narrowed to marketing-only consent in response
 * to TCR A2P 10DLC campaign rejection citing "marketing consent was
 * combined with other consents." The v1.0 label bundled "customer
 * care and marketing" in a single checkbox; v2.0 limits the consent
 * scope to promotional messaging only. Transactional / account-update
 * notifications now require separate consent (out of scope for this
 * checkbox). Disclosure text:
 *   "Yes, send me marketing text messages from LeadSmart AI. By
 *    checking this box and providing my phone number above, I consent
 *    to receive promotional text messages from LeadSmart AI about
 *    real-estate services, new listings, market updates, and special
 *    offers.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 *
 * v1.0 — initial — shipped 2026-04-27 in PR #168. Disclosure text:
 *   "Yes, send me text messages from LeadSmart AI. By checking this
 *    box and providing my phone number above, I consent to receive
 *    text messages from LeadSmart AI for customer care and marketing
 *    related to real-estate services, account updates, and product
 *    information.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 */
export const CONTACT_FORM_DISCLOSURE_VERSION = "v2.0_2026-05-25";

/**
 * /oh/[slug] open-house sign-in form.
 *
 * v1.0 — initial — shipped alongside PR-H. The form's "marketing
 * consent" checkbox doubles as SMS opt-in (the existing instant-reply
 * flow from PR #164 only fires when this box is ticked + visitor is
 * non-agented). Disclosure text:
 *   "Yes, I agree to receive marketing communications (text + email)
 *    from the listing agent about this property and similar
 *    listings. Message frequency varies. Message and data rates may
 *    apply. Reply STOP to opt out at any time. Consent is not a
 *    condition of any purchase or service."
 *
 * Bump the version (and snapshot the prior text in this comment)
 * whenever the on-screen disclosure changes materially.
 */
export const OPEN_HOUSE_SIGNIN_DISCLOSURE_VERSION = "v1.0_2026-04-27";

/**
 * /api/idx/lead-capture (IDX consumer modal — favorite, save_search,
 * schedule_tour, contact_agent, view_threshold).
 *
 * v1.0 — initial — shipped alongside PR-H. The modal's TCPA opt-in
 * checkbox is required for the SMS-path; the audit row captures
 * whether it was ticked. Disclosure text:
 *   "By providing my phone number, I agree to receive text messages
 *    about this listing and related opportunities from this agent.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time."
 */
export const IDX_LEAD_CAPTURE_DISCLOSURE_VERSION = "v1.0_2026-04-27";

/**
 * /open-house-signup public registration page (QR-code-driven from
 * the property flyer at the open house).
 *
 * v2.0 — 2026-05-25 — narrowed to marketing-only consent in lockstep
 * with /contact v2.0 and /home-value-funnel v2.0. Same TCR rejection,
 * same fix. Disclosure text mirrors /contact v2.0 exactly:
 *   "Yes, send me marketing text messages from LeadSmart AI. By
 *    checking this box and providing my phone number above, I consent
 *    to receive promotional text messages from LeadSmart AI about
 *    real-estate services, new listings, market updates, and special
 *    offers.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 *
 * v1.0 — initial — shipped 2026-05-11 to support TCR A2P 10DLC
 * campaign re-submission. Disclosure text:
 *   "Yes, send me text messages from LeadSmart AI. By checking this
 *    box and providing my phone number above, I consent to receive
 *    text messages from LeadSmart AI for customer care and marketing
 *    related to real-estate services, account updates, and product
 *    information.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 *
 * Identical wording to /contact by design — the TCR campaign
 * description references the same four-element disclosure across
 * all three opt-in surfaces. Bump the version (and snapshot prior
 * text in this comment) on any material change.
 */
export const OPEN_HOUSE_SIGNUP_DISCLOSURE_VERSION = "v2.0_2026-05-25";

/**
 * `/home-value-funnel` (also reachable from `/`) — the highest-volume
 * public capture surface. Was previously missing TCR-compliant consent
 * UI, which caused A2P 10DLC campaign rejection 30909 because the
 * reviewer landing on the homepage saw no SMS consent checkbox at all.
 * v1.0 fixed that gap; v2.0 narrows the consent scope.
 *
 * v2.0 — 2026-05-25 — narrowed to marketing-only consent in lockstep
 * with /contact v2.0 and /open-house-signup v2.0. TCR resubmission
 * after rejection citing "marketing consent was combined with other
 * consents." Disclosure text mirrors /contact v2.0 exactly:
 *   "Yes, send me marketing text messages from LeadSmart AI. By
 *    checking this box and providing my phone number above, I consent
 *    to receive promotional text messages from LeadSmart AI about
 *    real-estate services, new listings, market updates, and special
 *    offers.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 *
 * v1.0 — initial — shipped 2026-05-19 alongside the same disclosure
 * wording used on /contact and /open-house-signup so the TCR
 * resubmission can reference one canonical disclosure across surfaces.
 * Disclosure text:
 *   "Yes, send me text messages from LeadSmart AI. By checking this
 *    box and providing my phone number above, I consent to receive
 *    text messages from LeadSmart AI for customer care and marketing
 *    related to real-estate services, account updates, and product
 *    information.
 *    Message frequency varies. Message and data rates may apply.
 *    Reply STOP to opt out at any time, or HELP for help. Consent is
 *    not a condition of any purchase. See our Privacy Policy and
 *    Terms of Service for details."
 *
 * Bump the version (and snapshot prior text in this comment) on any
 * material change.
 */
export const HOME_VALUE_FUNNEL_DISCLOSURE_VERSION = "v2.0_2026-05-25";

/**
 * Stable source identifiers for the audit table. Keep them
 * machine-friendly (no spaces, no localized variations) so they group
 * cleanly when querying the table by source.
 */
export const CONSENT_SOURCE_CONTACT_FORM = "/contact";
export const CONSENT_SOURCE_OPEN_HOUSE_SIGNIN = "open_house_signin";
export const CONSENT_SOURCE_OPEN_HOUSE_SIGNUP = "open_house_signup";
export const CONSENT_SOURCE_IDX_LEAD_CAPTURE = "idx_lead_capture";
export const CONSENT_SOURCE_HOME_VALUE_FUNNEL = "home_value_funnel";
export const CONSENT_SOURCE_MARKETING_HUB = "marketing_hub";

/**
 * /@[username] agent marketing-hub enquiry form.
 *
 * v1.0 — initial — shipped with the Marketing Hub. Consent is to hear from the
 * AGENT, not from CloseBoss: the visitor is on that agent's page, the number
 * reaches that agent's receptionist and SMS sender, and the disclosure names
 * them rather than us. Unticked is a complete submission — it means "email me,
 * do not text me" — so the box never blocks an enquiry. Disclosure text:
 *   "Yes, you can text me about my enquiry. Message and data rates may apply.
 *    Reply STOP to opt out. Consent is not a condition of any purchase."
 *
 * Bump the version (and snapshot the prior text here) whenever the on-screen
 * disclosure changes materially.
 */
export const HUB_LEAD_DISCLOSURE_VERSION = "v1.0_2026-08-29";

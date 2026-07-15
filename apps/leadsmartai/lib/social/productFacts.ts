/**
 * What RealtyBoss actually does — the ground truth for anything we say publicly.
 *
 * ONE source of truth, deliberately. The brand-post GENERATOR writes against
 * this list, and the claim REVIEWER checks against the same list. If they held
 * separate copies they would drift, and the reviewer would start arguing with
 * the writer about the wrong things — flagging true claims and waving through
 * false ones. Independence between them comes from the reviewer never seeing
 * the writer's prompt or reasoning, not from a second set of facts.
 *
 * KEEP THIS HONEST. Everything here is a claim we make to real agents in public.
 * When a feature ships, add it; when a feature is only planned, it belongs in
 * NOT_TRUE until the day it works. A line here is a promise.
 */

export const PRODUCT_CAPABILITIES = `
- AI Receptionist: answers inbound calls 24/7, texts back calls it can't reach, qualifies callers, and remembers a caller's name, language, area and budget so a returning caller is greeted and asked to confirm rather than re-interrogated.
- Missed-call callbacks: when a call is missed, the AI calls the person back and KEEPS RETRYING on a schedule until it connects or the ladder is exhausted (a configurable number of attempts per day, over a configurable number of days — see lib/missed-call/callbacks.ts). "It keeps calling until it connects" is fair; "it calls forever" is not.
- AI Sales Assistant: outbound real voice calls, SMS and email to leads on a cadence; a composer to send now or schedule for later; replies to inbound texts automatically.
- AI Marketing Assistant: weekly social post drafts with auto-branded card images; market reports; a regional newsletter.
- AI Transaction Assistant: tracks contingencies and closing milestones and flags what's due before it's late.
- AI Accounting Assistant.
- Boss Assistant: one plain-English command and the team executes it (CMAs, seller presentations, showings, cold-call/qualify, open houses); multi-phase playbooks for house-selling and house-buying engagements; guided setup.
- AI CMA: a data-backed comparative market analysis built from real, cited comparable sales found on the web.
- Net sheet: gross-to-net seller proceeds.
- A free 59-skill Realtor AI Skills Library at realtybossai.com/skills-library — no signup.
- Works natively in English AND Chinese (calls, texts, listings, disclosures) — localized, not machine-translated.
- A compliance gate (Fair Housing + advertising) on everything written for the public.
- Mobile app.
- Imports contacts from other CRMs (CSV, with column auto-detection and presets for common CRMs).
- Saved AI-powered house searches per client, with a history of past runs. IMPORTANT: these are run ON DEMAND and keep a record — they do NOT run themselves on a schedule, do NOT monitor the market, and do NOT alert anyone when a new match appears. Never describe them as live, automatic, watching, or real-time.
`.trim();

/**
 * Things that sound plausible and are FALSE. Every entry earned its place: the
 * first two are real drafts an AI wrote about us that reached the content
 * library before a human caught them.
 */
export const PRODUCT_NOT_TRUE = `
- Real-time market monitoring, listing alerts, or anything that "watches" for new matches. (A generated post once claimed every buyer has "a live search running on their behalf" that tracks matches. Saved searches run on demand only.)
- A cross-assistant pipeline where work flows automatically end-to-end ("the receptionist's lead moves itself into the sales cadence", "everything is already connected"). The assistants share one platform and one contact database; they do not hand work to each other automatically.
- MLS/IDX integration, a lockbox/showing-service integration, e-signature, or any accounting/tax filing integration.
- Team/brokerage-wide rollups, lead routing between agents, or recruiting tools.
- Any statistic about RealtyBoss or its users (adoption counts, time saved, conversion lift). No such data exists. The only sanctioned number is the 59-skill library.
- Pricing, discounts, free trials, or plan names.
- Guaranteed outcomes ("you will close more deals").
`.trim();

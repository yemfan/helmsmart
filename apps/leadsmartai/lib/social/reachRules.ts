/**
 * Distribution rules injected into every social-content generation prompt
 * (brand marketing + evergreen client education).
 *
 * The other prompt sections keep a post SAFE and TRUE. This one makes it
 * REACH: modern feeds (Instagram, Threads, TikTok, YouTube, and increasingly
 * LinkedIn) are interest-graph, not follow-graph — they surface posts to
 * NON-followers based on predicted interest, and only widen a post's reach
 * when the first viewers engage quickly. Follower count barely matters; what
 * the copy gives the ranking model does. These rules encode the levers a
 * prompt can actually pull (format/video/timing are handled by the engine,
 * not the writer).
 *
 * Shared so there is exactly ONE copy of the reach playbook — if we learn
 * something new about what travels, it changes here and both generators get it.
 */
export const DISTRIBUTION_RULES = `DISTRIBUTION — write for the recommendation engine, not only the reader. Feeds show posts to people who DON'T follow the account, based on predicted interest, and widen reach only when the first viewers engage fast. Earn that on every post:
- HOOK HARD: the first line is the whole game. Open on tension, a curiosity gap, or one concrete specific moment, and make the first ~5 words carry it. Ban throat-clearing openers ("In today's market", "As a realtor", "Let's talk about", "Are you tired of", "Did you know").
- MAKE IT SAVEABLE: hand the reader ONE thing worth keeping — a script, a step, a checklist item, a reframe, a rule of thumb. Saves and shares outrank likes by far; a post that gives nothing unless you click will not travel.
- MAKE IT SHAREABLE: name the exact moment the reader would tag a peer on it ("this is so us"). Written to be forwarded, not just seen.
- STAY LEGIBLE TO THE ALGORITHM: put plain topic words a classifier understands into the copy (real estate, leads, follow-up, listings, showings, buyers, sellers) — the platform reads the text to decide who to show it to. Never so clever the subject is invisible.
- END BY INVITING A REPLY: close on a light, one-line question or invitation the reader can answer in seconds. Early comments are the single strongest distribution signal. Never end on a hard "sign up / buy now", and NEVER put a URL in the post body — the outbound link is added separately, outside the text.
- ONE IDEA, TIGHT: one point per post. Focused posts out-travel busy ones; short lines and white space beat dense paragraphs.`;

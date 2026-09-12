/**
 * What Emma opens a call with, and how to tell a chosen greeting from a
 * shipped one.
 *
 * A separate module from `receptionist-draft.ts` ON PURPOSE: the setup wizard
 * is a client component and needs `isStockGreeting`, while the draft module
 * imports the Anthropic SDK and the site reader (which imports `node:dns`).
 * Importing the one from the other would pull all of that into the browser
 * bundle — the failure `lib/client-server-imports.test.ts` exists to stop.
 * Nothing here imports anything.
 */

/** The greeting to suggest for a business with no greeting of its own. */
export function defaultGreeting(businessName: string): string {
  const name = businessName.trim() || "our office";
  return `Thanks for calling ${name}! This is Emma. How can I help you today?`;
}

/**
 * The greeting nobody chose.
 *
 * `organizations.voice_agent_greeting` ships with a stock sentence, and the
 * Settings form falls back to the same one, so a brand-new org's greeting is
 * never empty — it is generic. The first walkthrough of the guided setup
 * caught it: the draft politely declined to overwrite "a greeting the owner
 * already has", and a step whose entire promise is "here is what Emma will say
 * for YOUR business" showed a sentence that named no business at all.
 *
 * A value the product put there is not a value the owner set, so the draft
 * treats these as empty — and only these, matched exactly, so a greeting
 * someone actually wrote is never touched.
 */
const STOCK_GREETINGS = new Set([
  "Hello! Thank you for calling. How can I help you today?",
  "Hi! Thanks for calling. How can I help you today?",
]);

export function isStockGreeting(greeting: string | null | undefined): boolean {
  const g = (greeting ?? "").trim();
  return g.length === 0 || STOCK_GREETINGS.has(g);
}

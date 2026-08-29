/**
 * Offline smoke checks for contact intake helpers (no DB). Run: npx tsx scripts/smoke-contact-intake.ts
 */
import Papa from "papaparse";

import { contactIntakeBodySchema } from "../components/crm/contactIntakeSchema";
import { extractBusinessCardFieldsFromText } from "../lib/contact-intake/businessCardOcr";
import { incomingDuplicateScore } from "../lib/contact-enrichment/dedupe";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const phoneOnly = contactIntakeBodySchema.safeParse({ name: "", email: "", phone: "5551234567" });
assert(phoneOnly.success, "phone-only should validate");

const empty = contactIntakeBodySchema.safeParse({ name: "", email: "", phone: "" });
assert(!empty.success, "empty should fail");

const csv = "Name,Email\nJane Doe,jane@example.com\n";
const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
assert((parsed.data?.length ?? 0) >= 1, "csv parse");

const card = extractBusinessCardFieldsFromText("John Smith\njohn@example.com\n415-555-1212");
assert(card.email?.includes("@") ?? false, "card email");

const score = incomingDuplicateScore(
  { id: "1", email: "a@b.com", phone: "(415) 555-1212" },
  { id: "2", email: "a@b.com", phone: "(415) 555-1212" }
);
assert(score >= 50, "dup score");

console.log("smoke-contact-intake: ok");

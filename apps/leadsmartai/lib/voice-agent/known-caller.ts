import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findContactByPhone } from "@/lib/missed-call/service";
import type { KnownCaller } from "@repo/voice";

/** Compact money label for the spoken/prompt summary, e.g. 950000 -> "$950k",
 *  1_000_000 -> "$1M". */
function money(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Look up what we already know about an inbound caller by their phone number, so
 * the Retell receptionist can greet them by name and CONFIRM (rather than re-ask)
 * their preferences. Returns null for unknown callers. Best-effort — never throws
 * on the inbound hot path.
 *
 * Reuses `findContactByPhone` (the same 3-tier match used everywhere else) to
 * resolve the contact, then reads the durable memory captured by past calls
 * (see `contactMemoryPatch` in lead-capture.ts).
 */
export async function loadKnownCaller(
  agentId: string,
  fromPhone: string,
): Promise<KnownCaller | null> {
  try {
    const contact = await findContactByPhone(agentId, fromPhone);
    if (!contact) return null;

    const { data } = await supabaseAdmin
      .from("contacts")
      .select(
        "type, preferred_language, search_location, property_address, price_min, price_max, beds, baths, timeline, email",
      )
      .eq("id", contact.id as never)
      .maybeSingle();
    const c = (data ?? {}) as Record<string, unknown>;

    // One-line, human-readable memory the prompt confirms back to the caller.
    const parts: string[] = [];
    const type = String(c.type ?? "").toLowerCase();
    if (type === "buyer" || type === "seller" || type === "renter") parts.push(type);

    const area = (c.search_location as string) || (c.property_address as string) || "";
    if (area) parts.push(`interested in ${area}`);

    const min = num(c.price_min);
    const max = num(c.price_max);
    if (min && max) parts.push(`budget ${money(min)}–${money(max)}`);
    else if (max) parts.push(`budget up to ${money(max)}`);
    else if (min) parts.push(`budget from ${money(min)}`);

    const beds = num(c.beds);
    const baths = num(c.baths);
    if (beds) parts.push(`${beds} bed${baths ? ` / ${baths} bath` : ""}`);
    else if (baths) parts.push(`${baths} bath`);

    const timeline = String(c.timeline ?? "").trim();
    if (timeline) parts.push(`timeline ${timeline}`);

    // The email is the one detail she otherwise asks every returning caller for,
    // every single time. Given it, she confirms instead: "I have you as ... —
    // still the best one?"
    const email = String(c.email ?? "").trim();
    if (email) parts.push(`email on file ${email}`);

    const lang = String(c.preferred_language ?? "").trim().toLowerCase();

    return {
      name: contact.name || "",
      language: /^[a-z]{2}$/.test(lang) ? lang : "",
      summary: parts.join(", "),
    };
  } catch {
    return null;
  }
}

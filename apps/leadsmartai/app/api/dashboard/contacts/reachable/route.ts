import { NextResponse } from "next/server";
import { getContacts } from "@/lib/dashboardService";

export const runtime = "nodejs";

/**
 * Channel-aware contact picker for the Sales Assistant outreach composer:
 * every contact reachable by at least one channel, projected to
 * { id, name, phone, email }. The composer filters by the active channel
 * (phone for call/SMS, email for email). Superset of /voice/contacts, which
 * stays phone-only for the legacy call panels.
 *
 * Degrades to an empty list on error so manual entry still works.
 */
export async function GET() {
  try {
    const rows = await getContacts(500);
    const contacts = rows
      .map((c) => ({
        id: String(c.id),
        name: (c.name ?? "").trim() || "Unnamed contact",
        phone: typeof c.phone === "string" ? c.phone.trim() : "",
        email: typeof c.email === "string" ? c.email.trim() : "",
      }))
      .filter((c) => c.phone || c.email);
    return NextResponse.json({ ok: true, contacts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load contacts.";
    console.error("contacts/reachable", e);
    return NextResponse.json({ ok: false, error: msg, contacts: [] });
  }
}

import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/contacts/search
 *
 * Lightweight lookup for contact pickers (transaction form, task assignment,
 * etc.). Returns only the fields needed to render a one-line row:
 *   - `id`, `name` (first + last or email fallback), `email`, `phone`.
 *
 * Modes:
 *   - `?id=<uuid>` — single-contact resolve. Used when a page arrives with a
 *     contact pre-selected (e.g. `?contactId=` deep link) and we need the
 *     display name without dragging the whole contact view through.
 *   - `?q=<text>` — prefix/substring search across name + email + phone. ≤10
 *     results by default; callers can pass `?limit=` up to 25.
 *
 * Always scoped to the authed agent. Deliberately does NOT hit the full
 * contacts pipeline (signals, lifecycle, ranking) — that's a scoped ~100ms
 * cost we don't want every keystroke in a dropdown.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    const rawLimit = Number(url.searchParams.get("limit") ?? "10");
    const limit = Math.max(1, Math.min(25, Number.isFinite(rawLimit) ? rawLimit : 10));

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, email, phone, property_address")
        .eq("agent_id", String(agentId) as never)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ ok: true, contact: null });
      return NextResponse.json({ ok: true, contact: toPickerRow(data) });
    }

    let query = supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, email, phone, property_address")
      .eq("agent_id", String(agentId) as never)
      .order("last_contacted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      // PostgREST `.or(...)` uses comma as delimiter. Escape any user commas.
      // Fields searched: first/last name, email, phone (both columns).
      const safe = q.replace(/[%,]/g, "");
      const like = `%${safe}%`;
      query = query.or(
        [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `email.ilike.${like}`,
          `phone.ilike.${like}`,
        ].join(","),
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const contacts = (data ?? []).map((r) => toPickerRow(r as Record<string, unknown>));
    return NextResponse.json({ ok: true, contacts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET contacts/search:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type PickerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  propertyAddress: string | null;
};

function toPickerRow(r: Record<string, unknown>): PickerRow {
  const first = (r.first_name as string | null) ?? "";
  const last = (r.last_name as string | null) ?? "";
  const email = (r.email as string | null) ?? null;
  const phone =
    (r.phone as string | null) ?? null;
  const joined = `${first} ${last}`.trim();
  const name = joined || email || "(no name)";
  return {
    id: String(r.id),
    name,
    email,
    phone,
    propertyAddress: (r.property_address as string | null) ?? null,
  };
}

import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveContactLocation } from "@/lib/contacts/resolveLocation";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One-shot (and re-runnable) backfill: derive city/state for contacts that are
 * missing one or both, from their `address` / `search_location`. Only FILLS
 * gaps — never overwrites an explicit value. Guarded like the crons.
 * Supports `?limit=` for chunked runs and `?dry=1` to preview counts.
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ ok: false, error: "service role not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 2000, 1), 5000);
  const dry = url.searchParams.get("dry") === "1";

  const { data, error } = await supabaseServer
    .from("contacts")
    .select("id, city, state, address, search_location")
    .or("city.is.null,state.is.null")
    .or("address.not.is.null,search_location.not.is.null")
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    city: string | null;
    state: string | null;
    address: string | null;
    search_location: string | null;
  }[];

  let updated = 0;
  const updates: { id: string; patch: Record<string, string> }[] = [];

  for (const row of rows) {
    const resolved = resolveContactLocation(row);
    const patch: Record<string, string> = {};
    if (!(row.city ?? "").trim() && resolved.city) patch.city = resolved.city;
    if (!(row.state ?? "").trim() && resolved.state) patch.state = resolved.state;
    if (Object.keys(patch).length > 0) updates.push({ id: row.id, patch });
  }

  if (!dry) {
    for (const u of updates) {
      const { error: upErr } = await supabaseServer
        .from("contacts")
        .update(u.patch as never)
        .eq("id", u.id);
      if (!upErr) updated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    fillable: updates.length,
    updated: dry ? 0 : updated,
    dry,
  });
}

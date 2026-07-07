import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Weekly Regional Newsletter — subscribe capture (Phase 1).
 *
 * Captures the subscriber to newsletter_subscriptions via the service-role
 * client (the table is RLS-deny). NO EMAIL IS SENT in Phase 1 — this only builds
 * the list. agent_id is null (public RealtyBoss subscription); source 'web'.
 * On conflict (same email + region) it does nothing (idempotent).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_LEVELS = new Set(["national", "state", "metro"]);

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Subscriptions are temporarily unavailable." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const email = String(o.email ?? "").trim().toLowerCase();
  const regionLevel = String(o.regionLevel ?? "").trim().toLowerCase();
  const regionCode = String(o.regionCode ?? "").trim();
  const regionName =
    typeof o.regionName === "string" && o.regionName.trim() ? o.regionName.trim() : null;

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }
  if (!VALID_LEVELS.has(regionLevel) || !regionCode) {
    return NextResponse.json(
      { ok: false, error: "Please choose a region." },
      { status: 400 },
    );
  }

  try {
    // agent_id null = public RealtyBoss subscription. The dedupe index is on an
    // EXPRESSION (lower(email), region_code, coalesce(agent_id::text,'')), which
    // PostgREST's upsert onConflict can't target by a column list — so we plain
    // insert and treat a unique-violation (23505) as success (idempotent, "on
    // conflict do nothing").
    const { error } = await supabaseServer.from("newsletter_subscriptions").insert({
      email,
      region_level: regionLevel,
      region_code: regionCode,
      region_name: regionName,
      agent_id: null,
      status: "subscribed",
      source: "web",
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ ok: true });
      }
      console.error("newsletter subscribe insert error", error);
      return NextResponse.json(
        { ok: false, error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("newsletter subscribe error", e);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

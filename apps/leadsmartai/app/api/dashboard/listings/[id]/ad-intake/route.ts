import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { extractListingFromUrl, saveListingAdFacts } from "@/lib/listings/adIntake";
import { isAnthropicConfigured } from "@/lib/anthropic";
import type { ListingAdFacts } from "@/lib/listings/types";

// web_fetch + extraction can take a bit.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/dashboard/listings/[id]/ad-intake
 * Pull listing facts + photos from the listing's MLS URL (or a URL in the body)
 * via Claude web_fetch, persist them onto the listing, and return the facts.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    if (!isAnthropicConfigured()) {
      return NextResponse.json({ ok: false, error: "AI isn't configured (missing ANTHROPIC_API_KEY)." }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const url =
      typeof body.url === "string" && /^https?:\/\//i.test(body.url.trim())
        ? body.url.trim()
        : listing.mls_url;
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "This listing has no MLS URL. Paste a listing URL or fill the facts in manually." },
        { status: 400 },
      );
    }

    const facts = await extractListingFromUrl(url);
    await saveListingAdFacts(String(agentId), id, facts, "mls_url");
    const updated = await getListingById(String(agentId), id);
    return NextResponse.json({ ok: true, facts, listing: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-intake:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/listings/[id]/ad-intake
 * Save agent-edited ad facts (manual source). Body is a partial ListingAdFacts.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const facts: ListingAdFacts = {
      beds: numOrNull(body.beds),
      baths: numOrNull(body.baths),
      sqft: numOrNull(body.sqft),
      yearBuilt: numOrNull(body.yearBuilt),
      price: numOrNull(body.price),
      address: strOrNull(body.address),
      city: strOrNull(body.city),
      state: strOrNull(body.state),
      description: strOrNull(body.description),
      highlights: strArr(body.highlights).slice(0, 6),
      photoUrls: urlArr(body.photoUrls).slice(0, 12),
      confidence: 0,
      warnings: [],
    };
    await saveListingAdFacts(String(agentId), id, facts, "manual");
    const updated = await getListingById(String(agentId), id);
    return NextResponse.json({ ok: true, listing: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("PATCH /api/dashboard/listings/[id]/ad-intake:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}
function urlArr(v: unknown): string[] {
  return strArr(v).filter((u) => /^https?:\/\//i.test(u));
}

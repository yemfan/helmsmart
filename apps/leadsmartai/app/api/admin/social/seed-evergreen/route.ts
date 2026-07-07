import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateEvergreenBatch } from "@/lib/social/generateEvergreen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Streams a big batch from Claude — give it headroom.
export const maxDuration = 300;

/**
 * Admin seed route for the shared evergreen social_content_library.
 *
 * Generates ~28 evergreen posts (Claude, no web_search) and upserts them on
 * (title) DO NOTHING — idempotent, so re-running only backfills genuinely new
 * titles. Guarded by verifyCronRequest (Bearer CRON_SECRET / ?secret=) and the
 * service-role key, since the RLS-deny library needs service role to write.
 *
 * The main agent calls this once after applying the migrations. Override the
 * batch size with ?n=NN.
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const url = new URL(req.url);
    const nRaw = Number(url.searchParams.get("n"));
    const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(40, Math.floor(nRaw)) : 28;

    const posts = await generateEvergreenBatch(n);
    if (posts.length === 0) {
      return NextResponse.json(
        { ok: false, error: "generator returned no usable posts" },
        { status: 502 },
      );
    }

    const rows = posts.map((p) => ({
      category: p.category,
      title: p.title,
      hook: p.hook,
      body: p.body,
      hashtags: p.hashtags,
      image_prompt: p.image_prompt || null,
      cta: p.cta || null,
      status: "active",
    }));

    // Idempotent: on (title) conflict do nothing (ignoreDuplicates).
    const { data, error } = await supabaseServer
      .from("social_content_library")
      .upsert(rows, { onConflict: "title", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      generated: posts.length,
      inserted: Array.isArray(data) ? data.length : 0,
    });
  } catch (e) {
    console.error("[social/seed-evergreen]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

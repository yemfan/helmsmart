/**
 * GET /api/cron/social/linkedin
 * Publishes scheduled LinkedIn `social_posts` whose time has arrived, across all
 * orgs. Inline Bearer CRON_SECRET auth (matching the other cron routes).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { publishLinkedInPost } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const auth = request.headers.get("Authorization");
  if (!auth || !CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await createServiceClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("social_posts")
    .select("id, organization_id, content")
    .eq("platform", "linkedin")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .limit(25);

  const rows = (due ?? []) as Array<{ id: string; organization_id: string; content: string }>;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of rows) {
    const res = await publishLinkedInPost(row.organization_id, row.content);
    await db
      .from("social_posts")
      .update(
        res.ok
          ? {
              status: "published",
              published_url: res.url ?? null,
              published_at: nowIso,
              updated_at: nowIso,
            }
          : { status: "failed", updated_at: nowIso },
      )
      .eq("id", row.id);
    results.push({ id: row.id, ok: res.ok, error: res.error });
  }

  return NextResponse.json({ ok: true, processed: rows.length, results });
}

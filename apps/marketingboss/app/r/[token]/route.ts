import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /r/<token> — the owned click redirect.
 *
 * This is the only click signal that behaves the same on every platform:
 * Pinterest reports clicks, Facebook reports them with the right scope,
 * LinkedIn only for organisation pages, and YouTube / Instagram / Threads /
 * TikTok report nothing usable. Owning the hop means one number we can trust.
 *
 * Privacy: we record a timestamp, the referrer, and the user agent. No IP, no
 * cookie, no identifier — an attribution count does not need them, and storing
 * them would make this a tracking system rather than a click counter.
 *
 * A visitor is never signed in, so this reads through the service-role client
 * and is deliberately the only writer to link_clicks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = (token ?? "").trim().slice(0, 64);
  if (!clean) return NextResponse.redirect(new URL("/", req.url));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tracked_links")
    .select("id, destination_url")
    .eq("token", clean)
    .maybeSingle();

  // An unknown or expired token should land somewhere sensible rather than on
  // an error page — the person clicking did nothing wrong.
  if (error || !data) return NextResponse.redirect(new URL("/", req.url));

  const link = data as { id: string; destination_url: string };

  // Counting must never delay or break the redirect.
  try {
    await admin.from("link_clicks").insert({
      link_id: link.id,
      referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch {
    /* the click is worth less than the visit */
  }

  return NextResponse.redirect(link.destination_url, { status: 302 });
}

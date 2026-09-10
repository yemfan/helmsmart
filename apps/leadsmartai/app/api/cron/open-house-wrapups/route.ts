import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { prepareDueWrapups } from "@/lib/open-houses/wrapup.server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Hourly: every open house that has ended gets its day summarised from the
 * sign-in sheet, the owner prefilled from the listing, and the host told
 * the wrap-up is ready to comment on and send.
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await prepareDueWrapups();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[open-house-wrapups] cron:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

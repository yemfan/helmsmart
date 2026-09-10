import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { buildCloseBossIntelligence } from "@/lib/closeboss/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const url = new URL(req.url);
    const leadId = String(url.searchParams.get("lead_id") ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });
    }
    const data = await buildCloseBossIntelligence(leadId);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { listMobileLeads } from "@/lib/mobile/leads";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "30");
    const filter = (url.searchParams.get("filter") ?? "").trim();
    const search = (url.searchParams.get("q") ?? "").trim();

    const result = await listMobileLeads({
      agentId: auth.ctx.agentId,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 30,
      filter:
        filter === "hot" || filter === "inactive" || filter === "high_deal_potential"
          ? filter
          : undefined,
      search: search || undefined,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("GET /api/mobile/leads", e);
    return NextResponse.json({ ok: false, success: false, error: msg }, { status: 500 });
  }
}

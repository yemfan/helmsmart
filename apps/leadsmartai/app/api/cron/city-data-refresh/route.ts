import { NextResponse } from "next/server";
import { refreshAllCitiesDaily } from "@/lib/cityDataEngine";
import { verifyCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
/*
 * Each market is an AI web-search call, and the plan now covers every row in
 * city_market_data rather than a fixed 117. Ask for the ceiling and let the
 * engine stop itself just under it, so a long run reports what it did instead
 * of being killed mid-flight.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshAllCitiesDaily();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

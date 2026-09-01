import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// Dev-only helper: fetch a single lead opted-in for SMS.
export async function GET(req: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "1");

    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select("id,phone,sms_opt_in,automation_disabled,rating,property_address,name")
      .eq("sms_opt_in", true)
      .not("phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(Number.isFinite(limit) ? Math.max(1, limit) : 1);

    const row = Array.isArray(leadRow) ? leadRow[0] : null;
    return NextResponse.json({ ok: true, lead: row ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}


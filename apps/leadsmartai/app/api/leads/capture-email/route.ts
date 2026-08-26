import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getPropertyData } from "@/lib/getPropertyData";
import { getPropertyByAddress } from "@/lib/propertyService";
import { generateOpenHouseReportData } from "@/lib/openHouseReport";
import { sendEmail } from "@/lib/email";
import { scheduleEmailSequenceForLeadSkipDay0 } from "@/lib/emailSequences";
import { getMarketplaceSessionId } from "@/lib/marketplaceSessionId";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { EMAIL_BRAND } from "@/lib/email";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      address?: string;
      email?: string;
      source?: string;
    };

    const address = String(body.address ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const source = String(body.source ?? "progressive_capture").trim() || "progressive_capture";

    if (!address) {
      return NextResponse.json({ ok: false, error: "address is required." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
    }

    // 1) Ensure property data exists
    await getPropertyData(address, true);
    const property = await getPropertyByAddress(address);
    if (!property) {
      return NextResponse.json({ ok: false, error: "Property not found." }, { status: 404 });
    }

    // 2) Insert lead (email-only)
    const { data: leadInsert, error: leadErr } = await supabaseServer
      .from("contacts")
      .insert({
        agent_id: null,
        property_address: property.address,
        name: null,
        email,
        phone: null,
        source,
        stage: "email_captured",
        lead_status: "new",
        notes: null,
      } as any)
      .select("id")
      .single();

    if (leadErr || !leadInsert?.id) {
      return NextResponse.json(
        { ok: false, error: leadErr?.message ?? "Failed to save lead." },
        { status: 500 }
      );
    }

    const leadId = String(leadInsert.id);

    // Best-effort: attach property_id
    try {
      await supabaseServer.from("contacts").update({ property_id: property.id }).eq("id", leadId);
    } catch {}

    // 3) Generate report + store
    const reportData = await generateOpenHouseReportData({
      propertyId: property.id,
      address: property.address,
    });

    // Some schemas define reports.contact_id as UUID while leads.id is BIGINT.
    // Try with lead_id first; if it fails with a type error, retry without lead_id.
    let reportInsert: any = null;
    let reportErr: any = null;

    ({ data: reportInsert, error: reportErr } = await supabaseServer
      .from("reports")
      .insert({
        property_id: property.id,
        contact_id: leadId,
        report_data: reportData,
      } as any)
      .select("id")
      .single());

    if (reportErr) {
      const msg = String(reportErr?.message ?? reportErr);
      const leadIdUuidMismatch =
        /invalid input syntax for type uuid/i.test(msg) ||
        /column.*lead_id.*is of type uuid/i.test(msg);

      if (leadIdUuidMismatch) {
        ({ data: reportInsert, error: reportErr } = await supabaseServer
          .from("reports")
          .insert({
            property_id: property.id,
            report_data: reportData,
          } as any)
          .select("id")
          .single());
      }
    }

    if (reportErr || !reportInsert?.id) {
      return NextResponse.json(
        { ok: false, error: reportErr?.message ?? "Failed to create report." },
        { status: 500 }
      );
    }

    const reportId = String(reportInsert.id);

    // Best-effort: store report_id back on lead
    try {
      await supabaseServer.from("contacts").update({ report_id: reportId }).eq("id", leadId);
    } catch {}

    // 4) Email report link (generic greeting)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const reportLink = `${origin}/report/${encodeURIComponent(reportId)}?lead_id=${encodeURIComponent(
      leadId
    )}`;

    // Marketplace tracking: log estimator "submit" after the user unlocks the report.
    // Best-effort only; never block lead capture.
    try {
      const user = await getUserFromRequest(req);
      const sessionId = getMarketplaceSessionId(req);
      await supabaseServer.rpc("log_tool_usage_and_update_opportunity", {
        p_user_id: user?.id ?? null,
        p_session_id: sessionId,
        p_tool_name: "estimator",
        p_property_address: address,
        p_action: "submit",
        p_estimated_value: null,
      } as any);
    } catch {}

    try {
      await sendEmail({
        to: email,
        subject: "Your Home Value Report",
        text: `Hi there,\n\nHere is your home value report:\n\n👉 ${reportLink}\n\n— ${EMAIL_BRAND}`,
      });
    } catch {}

    // 5) Follow-up sequence (skip day 0 since we sent report email)
    await scheduleEmailSequenceForLeadSkipDay0(leadId);

    return NextResponse.json({ ok: true, leadId, reportId, reportLink, stage: "email_captured" });
  } catch (e: any) {
    console.error("capture-email error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}


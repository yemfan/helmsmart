import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getPropertyData } from "@/lib/getPropertyData";
import { getPropertyByAddress } from "@/lib/propertyService";
import { generateOpenHouseReportData } from "@/lib/openHouseReport";
import { sendEmail } from "@/lib/email";
import { scheduleEmailSequenceForLeadSkipDay0 } from "@/lib/emailSequences";

export const runtime = "nodejs";

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
    };

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phoneRaw = String(body.phone ?? "").trim();
    const address = String(body.address ?? "").trim();

    if (!address) {
      return NextResponse.json(
        { success: false, message: "address is required." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { success: false, message: "name is required." },
        { status: 400 }
      );
    }
    if (!email) {
      return NextResponse.json(
        { success: false, message: "email is required." },
        { status: 400 }
      );
    }

    // 1) Ensure warehouse rows + snapshots are present.
    await getPropertyData(address, true);

    const property = await getPropertyByAddress(address);
    if (!property) {
      return NextResponse.json(
        { success: false, message: "Property not found after ingestion." },
        { status: 404 }
      );
    }

    // 2) Save lead to CRM.
    const { data: leadInsert, error: leadErr } = await supabaseServer
      .from("leads")
      .insert({
        agent_id: null,
        property_address: property.address,
        name,
        email,
        phone: phoneRaw ? formatUsPhone(phoneRaw) : null,
        source: "Home Value",
        lead_status: "new",
        notes: null,
      })
      .select("id")
      .single();

    if (leadErr || !leadInsert?.id) {
      return NextResponse.json(
        {
          success: false,
          message: leadErr?.message ?? "Failed to save your request.",
        },
        { status: 500 }
      );
    }

    const leadId = String(leadInsert.id);

    // Best-effort: attach property_id for easier CRM context later.
    try {
      const { error: updatePropErr } = await supabaseServer
        .from("leads")
        .update({ property_id: property.id })
        .eq("id", leadId);

      if (updatePropErr) {
        console.error("lead-capture: lead property_id update failed", updatePropErr);
      }
    } catch (e) {
      console.error("lead-capture: lead property_id update threw", e);
    }

    // 3) Generate estimator + CMA report data.
    const reportData = await generateOpenHouseReportData({
      propertyId: property.id,
      address: property.address,
    });

    // 4) Save report to `reports`.
    const { data: reportInsert, error: reportErr } = await supabaseServer
      .from("reports")
      .insert({
        property_id: property.id,
        lead_id: leadId,
        report_data: reportData,
      })
      .select("id")
      .single();

    if (reportErr || !reportInsert?.id) {
      return NextResponse.json(
        {
          success: false,
          message: reportErr?.message ?? "Failed to save property report.",
        },
        { status: 500 }
      );
    }

    const reportId = String(reportInsert.id);

    // 5) Store report_id back on the lead (best-effort).
    try {
      const { error: leadReportUpdateErr } = await supabaseServer
        .from("leads")
        .update({ report_id: reportId })
        .eq("id", leadId);

      if (leadReportUpdateErr) {
        console.error("lead-capture: lead report_id update failed", leadReportUpdateErr);
      }
    } catch (e) {
      console.error("lead-capture: lead report_id update threw", e);
    }

    // 6) Email the report link immediately.
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const reportLink = `${origin}/report/${encodeURIComponent(reportId)}`;

    const subject = "Your Home Value Report";
    const emailText = `Hi ${name},

Here is your home value report:

👉 ${reportLink}

Includes:
- Estimated value
- Market comps
- Pricing insights

Let me know if you'd like a personalized CMA.

Best,
Michael Ye
Real Estate Advisor`;

    try {
      await sendEmail({
        to: email,
        subject,
        text: emailText,
      });
    } catch (e) {
      // Email delivery should never break lead capture.
      console.error("lead-capture: sendEmail failed", e);
    }

    // 7) Add lead to follow-up automation.
    // We already sent the report email immediately above, so we skip the "day 0" email.
    await scheduleEmailSequenceForLeadSkipDay0(leadId);

    return NextResponse.json({
      success: true,
      reportId,
      reportLink,
    });
  } catch (e: any) {
    console.error("lead-capture error", e);
    return NextResponse.json(
      { success: false, message: e?.message ?? "Server error capturing lead." },
      { status: 500 }
    );
  }
}


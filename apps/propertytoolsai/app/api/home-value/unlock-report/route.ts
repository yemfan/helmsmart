import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLeadFromHomeValue } from "@/lib/home-value/lead";
import { queueHomeValueSequence } from "@/lib/home-value/followup-sequence";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, name, email, phone } = body;

    if (!sessionId || !name || !email) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Try to load session from DB; fall back to client-provided data
    let session: Record<string, any> | null = null;
    const { data: dbSession } = await supabaseAdmin
      .from("home_value_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (dbSession) {
      session = dbSession;
    } else {
      // Use data sent by client (estimate values already in browser state)
      session = {
        property_address: body.property_address || "",
        full_address: body.property_address || "",
        city: body.city || null,
        zip: body.zip || null,
        estimate_value: body.estimate_value || 0,
        range_low: body.range_low || 0,
        range_high: body.range_high || 0,
        confidence: body.confidence || "low",
        confidence_score: body.confidence_score || 0,
        median_ppsf: body.median_ppsf || 0,
        local_trend_pct: null,
        comp_count: null,
        recommendations: body.recommendations || {},
      };
    }

    const propertyAddress = session.property_address || session.full_address || body.property_address || "";

    // --- Core: create unowned contact (lands in shared lead queue) ---
    // Pre-assignment is intentionally gone: home-value leads now drop
    // into /dashboard/lead-queue with agent_id=null so any agent can
    // claim them. Targeted agent notification is removed for the same
    // reason — there is no specific agent to notify until claim. Once
    // claimed, the per-agent flow picks up downstream.
    const lead = await createLeadFromHomeValue({
      name,
      email,
      phone,
      address: propertyAddress,
      estimateValue: session.estimate_value,
      confidence: session.confidence,
      sessionId,
      zip: session.zip,
      city: session.city,
    });

    // Customer-facing follow-up sequence (email/SMS to the lead). We
    // already accept null assignedAgent — the email template falls
    // back to a generic "PropertyTools team" sender when the lead is
    // still unclaimed.
    queueHomeValueSequence({
      leadId: String(lead.id),
      customerName: name,
      customerEmail: email,
      customerPhone: phone ?? null,
      propertyAddress,
      estimateValue: session.estimate_value,
      assignedAgentName: null,
      assignedAgentId: null,
    }).catch((e) => console.error("Followup queue failed:", e));

    // Persist report row (best-effort)
    supabaseAdmin
      .from("home_value_reports")
      .upsert({
        session_id: sessionId,
        lead_id: String(lead.id),
        property_address: propertyAddress,
        estimate_value: session.estimate_value,
        range_low: session.range_low,
        range_high: session.range_high,
        confidence: session.confidence,
        report_json: session,
        pdf_url: null,
        emailed_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error("Report upsert failed:", error);
      });

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      // Lead lives in the queue until an agent claims it; no
      // assigned-agent payload to surface to the client at this point.
      assignedAgent: null,
      report: {
        estimate: {
          value: session.estimate_value,
          rangeLow: session.range_low ?? session.estimate_low,
          rangeHigh: session.range_high ?? session.estimate_high,
          confidence: session.confidence,
          confidenceScore: session.confidence_score,
        },
        market: {
          medianPpsf: session.median_ppsf,
          localTrendPct: session.local_trend_pct,
          compCount: session.comp_count,
          city: session.city,
        },
        recommendations: session.recommendations ?? {},
        pdfUrl: null,
      },
    });
  } catch (error) {
    console.error("unlock-report error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unlock report. Please try again." },
      { status: 500 }
    );
  }
}

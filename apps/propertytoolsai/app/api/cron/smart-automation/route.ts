import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { generateAutomationMessage } from "@/lib/automationAI";

function hoursAgoIso(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysAgoIso(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  try {
    const nowIso = new Date().toISOString();

    const { data: rules, error: rulesErr } = await supabaseServer
      .from("automation_rules")
      .select("id,name,trigger_type,condition,message_template,active")
      .eq("active", true);
    if (rulesErr) throw rulesErr;

    // `leads` is a VIEW over `contacts`, so name/email/phone are columns on it.
    // This used to embed `contact:contact_id(...)`, which PostgREST cannot resolve
    // on a view — every run died with PGRST200 and the job has been doing nothing.
    const { data: leads, error: leadsErr } = await supabaseServer
      .from("leads")
      .select(
        "id,agent_id,property_address,rating,contact_frequency,contact_method,engagement_score,last_activity_at,automation_disabled,name,email,phone"
      )
      .limit(200);
    if (leadsErr) throw leadsErr;

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const lead of (leads as any[]) ?? []) {
      processed++;
      const contactId = String(lead.id ?? "");
      if (lead.automation_disabled) {
        skipped++;
        continue;
      }
      const email = String(lead?.email ?? "");
      const method = String(lead.contact_method ?? "email");
      if (!email || (method !== "email" && method !== "both")) {
        skipped++;
        continue;
      }

      // Cooldown: avoid duplicates within 24h
      const { data: recentLog } = await supabaseServer
        .from("automation_logs")
        .select("id")
        .eq("contact_id", contactId)
        .gte("created_at", hoursAgoIso(24))
        .limit(1)
        .maybeSingle();
      if (recentLog?.id) {
        skipped++;
        continue;
      }

      const engagementScore = Number(lead.engagement_score ?? 0);
      const lastActivityAt = lead.last_activity_at ? String(lead.last_activity_at) : null;

      // Fetch recent events to support triggers + AI context
      const { data: events } = await supabaseServer
        .from("lead_events")
        .select("event_type,created_at")
        .eq("lead_id", contactId)
        .order("created_at", { ascending: false })
        .limit(10);

      const recentEvents = ((events as any[]) ?? []).map((e) => String(e.event_type));
      const recentReportView = ((events as any[]) ?? []).find(
        (e) =>
          String(e.event_type) === "report_view" &&
          new Date(String(e.created_at)).getTime() >= Date.now() - 24 * 60 * 60 * 1000
      );

      // Evaluate active rules, first match wins.
      let matchedRule: any = null;
      for (const r of (rules as any[]) ?? []) {
        const trigger = String(r.trigger_type);
        const cond = (r.condition ?? {}) as any;

        if (trigger === "report_view") {
          const within = Number(cond.within_hours ?? 24);
          const cutoff = Date.now() - within * 60 * 60 * 1000;
          const ok =
            ((events as any[]) ?? []).some(
              (e) =>
                String(e.event_type) === "report_view" &&
                new Date(String(e.created_at)).getTime() >= cutoff
            );
          if (ok) {
            matchedRule = r;
            break;
          }
        }

        if (trigger === "high_engagement") {
          const min = Number(cond.min_score ?? 70);
          if (engagementScore > min) {
            matchedRule = r;
            break;
          }
        }

        if (trigger === "inactivity") {
          const days = Number(cond.inactive_days ?? 7);
          const cutoffIso = daysAgoIso(days);
          if (!lastActivityAt || lastActivityAt <= cutoffIso) {
            matchedRule = r;
            break;
          }
        }
      }

      if (!matchedRule) {
        skipped++;
        continue;
      }

      // Respect follow-up cadence: don’t exceed lead’s contact_frequency by sending too frequently.
      // (Simple guard: if lead frequency is weekly/monthly, also enforce 24h cooldown already above.)
      const rating = (String(lead.rating ?? "warm") as any) as "hot" | "warm" | "cold";
      const name =
        String(lead?.contact?.name ?? "").trim() ||
        String(email).split("@")[0] ||
        "there";
      const address = String(lead.property_address ?? "");

      const message = await generateAutomationMessage({
        template: String(matchedRule.message_template ?? ""),
        name,
        address,
        rating,
        engagementScore,
        recentEvents,
      });

      try {
        await sendEmail({
          to: email,
          subject: recentReportView ? "Quick question about your report" : "Quick follow-up",
          text: message,
        });

        await supabaseServer.from("automation_logs").insert({
          agent_id: lead.agent_id ?? null,
          contact_id: contactId,
          rule_id: matchedRule.id,
          event: "sent",
          reason: matchedRule.name ?? null,
          payload: { message },
          created_at: nowIso,
        } as never);

        // Unified timeline. This used to write to `communications`, which no
        // longer exists; message_logs replaced it.
        await supabaseServer.from("message_logs").insert({
          contact_id: contactId,
          type: "email",
          status: "sent",
          content: message,
          created_at: nowIso,
        } as never);

        sent++;
      } catch (e) {
        failed++;
        await supabaseServer.from("automation_logs").insert({
          agent_id: lead.agent_id ?? null,
          contact_id: contactId,
          rule_id: matchedRule.id,
          event: "failed",
          reason: e instanceof Error ? e.message : "send failed",
          payload: { message },
          created_at: nowIso,
        } as never);
      }
    }

    return NextResponse.json({ ok: true, processed, sent, skipped, failed });
  } catch (e: any) {
    console.error("smart-automation cron error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}


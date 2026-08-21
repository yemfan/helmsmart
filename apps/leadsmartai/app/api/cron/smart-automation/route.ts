import { NextResponse } from "next/server";
import { userHasCrmFeature } from "@/lib/billing/subscriptionAccess";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { generateAutomationMessage } from "@/lib/automationAI";
import { verifyCronRequest } from "@/lib/cronAuth";

const automationAllowedByAgent = new Map<string, boolean>();

async function agentMayUseAutomation(agentId: unknown): Promise<boolean> {
  const key = agentId == null || agentId === "" ? "" : String(agentId);
  if (!key) return false;
  if (automationAllowedByAgent.has(key)) {
    return automationAllowedByAgent.get(key)!;
  }
  const { data: agent, error } = await supabaseServer
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId as string | number)
    .maybeSingle();
  if (error || !agent?.auth_user_id) {
    automationAllowedByAgent.set(key, false);
    return false;
  }
  const ok = await userHasCrmFeature(String(agent.auth_user_id), "automation");
  automationAllowedByAgent.set(key, ok);
  return ok;
}

function hoursAgoIso(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysAgoIso(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const nowIso = new Date().toISOString();

    const { data: rules, error: rulesErr } = await supabaseServer
      .from("automation_rules")
      .select("id,name,trigger_type,condition,message_template,active")
      .eq("active", true);
    if (rulesErr) throw rulesErr;

    // Contact info lives on `contacts` itself. This used to read `leads` and embed
    // `contact:contact_id(...)`; after the leads->contacts consolidation there is no
    // contact_id column here, so that embed made PostgREST reject the whole query
    // (PGRST200) and this cron had not processed a single row since.
    const { data: leads, error: leadsErr } = await supabaseServer
      .from("contacts")
      .select(
        "id,agent_id,name,email,phone,property_address,rating,contact_frequency,contact_method,engagement_score,last_activity_at,automation_disabled"
      )
      .limit(200);
    if (leadsErr) throw leadsErr;

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const lead of (leads as any[]) ?? []) {
      processed++;
      const contactId = String(lead.id);
      if (!(await agentMayUseAutomation(lead.agent_id))) {
        skipped++;
        continue;
      }
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
        .from("contact_events")
        .select("event_type,created_at")
        .eq("contact_id", contactId)
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
        String(lead?.name ?? "").trim() ||
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
          contact_id: contactId,
          rule_id: matchedRule.id,
          message,
          status: "sent",
          created_at: nowIso,
        } as any);

        // Also log in communications for unified timeline.
        await supabaseServer.from("communications").insert({
          contact_id: contactId,
          agent_id: lead.agent_id ?? null,
          type: "email",
          content: message,
          status: "sent",
          created_at: nowIso,
        } as any);

        // Update last_contacted_at on the lead.
        try {
          await supabaseServer
            .from("contacts")
            .update({ last_contacted_at: nowIso } as Record<string, unknown>)
            .eq("id", contactId);
        } catch { /* best-effort */ }

        sent++;
      } catch (e) {
        failed++;
        await supabaseServer.from("automation_logs").insert({
          contact_id: contactId,
          rule_id: matchedRule.id,
          message,
          status: "failed",
          created_at: nowIso,
        } as any);
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


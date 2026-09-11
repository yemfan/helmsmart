/**
 * Business Insights generator — Tim (AI CIO)
 *
 * Pure server module (NOT "use server") so it can take a Supabase client and be
 * shared by the on-demand server action and the weekly cron. Gathers a week of
 * business metrics, asks Claude to interpret them, and persists a digest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { pctChange } from "@/lib/metrics-format";
import { moneyFormatter } from "@/lib/books-format";
import { languageDirectiveForJson } from "@/lib/i18n/directives";
import { translatorFor } from "@/lib/i18n/server";
import { addDays, calendarDate } from "@/lib/org-date";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface InsightItem {
  title: string;
  detail: string;
  sentiment: "positive" | "neutral" | "negative";
  metric?: string;
  recommendation?: string;
}

/**
 * Who the digest is written for. The locale is the OWNER's UI language — the
 * cookie in a request, `userUiLocale(ownerId)` in the cron — and the currency
 * is the organization's own, which does not follow it.
 */
export interface InsightReader {
  locale: string | null | undefined;
  currency: string | null | undefined;
  /** `organizations.timezone` — the org's "today" and the week's bounds. */
  timeZone?: string | null;
}

export interface BusinessInsight {
  periodStart: string;
  periodEnd: string;
  headline: string;
  summary: string;
  insights: InsightItem[];
  generatedAt: string;
}

interface WeekMetrics {
  revenueThisWeek: number;
  revenueLastWeek: number;
  newClientsThisWeek: number;
  newClientsLastWeek: number;
  invoicesSentThisWeek: number;
  invoicesPaidThisWeek: number;
  outstandingAR: number;
  overdueAR: number;
  overdueCount: number;
  openEstimatesValue: number;
  openEstimatesCount: number;
  tasksCompletedThisWeek: number;
  tasksCreatedThisWeek: number;
  appointmentsNextWeek: number;
  aiCallsAnswered: number;
  aiMessagesSent: number;
}

const DAY = 86_400_000;

/** Collect a week of business metrics for an org. `now` is injected (resume-safe). */
async function gatherMetrics(
  db: SupabaseClient,
  orgId: string,
  now: Date,
  timeZone: string | null | undefined,
): Promise<WeekMetrics> {
  const todayIso = now.toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY).toISOString();
  // Calendar dates are the org's; the instants above stay instants.
  const today = calendarDate(timeZone, now);
  const weekAgoDate = addDays(today, -7);
  const nextWeekDate = addDays(today, 7);

  const [
    paidThisWeekRes,
    paidLastWeekRes,
    newClientsThisRes,
    newClientsLastRes,
    invSentRes,
    invPaidCountRes,
    outstandingRes,
    estimatesRes,
    tasksCompletedRes,
    tasksCreatedRes,
    apptRes,
  ] = await Promise.all([
    db.from("invoices").select("total").eq("organization_id", orgId).eq("status", "paid").gte("paid_at", weekAgo).lte("paid_at", todayIso),
    db.from("invoices").select("total").eq("organization_id", orgId).eq("status", "paid").gte("paid_at", twoWeeksAgo).lt("paid_at", weekAgo),
    db.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", weekAgo),
    db.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", twoWeeksAgo).lt("created_at", weekAgo),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", weekAgo),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "paid").gte("paid_at", weekAgo),
    db.from("invoices").select("total, due_date, status").eq("organization_id", orgId).in("status", ["sent", "overdue"]),
    db.from("estimates").select("total").eq("organization_id", orgId).eq("status", "sent"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "completed").gte("updated_at", weekAgo),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", weekAgo),
    db.from("events").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("completed", false).gte("start_at", todayIso).lte("start_at", new Date(now.getTime() + 7 * DAY).toISOString()),
  ]);

  const sum = (rows: { total: number | string }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total), 0);

  const outstanding = outstandingRes.data ?? [];
  const overdue = outstanding.filter(
    (i) => i.status === "overdue" || (i.status === "sent" && String(i.due_date) < today)
  );

  // AI workforce metrics for the week (best-effort)
  let aiCallsAnswered = 0;
  let aiMessagesSent = 0;
  try {
    const { data: metrics } = await db
      .from("ai_employee_metrics")
      .select("metric_key, metric_value")
      .eq("organization_id", orgId)
      .gte("metric_date", weekAgoDate)
      .lte("metric_date", today);
    for (const m of metrics ?? []) {
      if (m.metric_key === "calls_answered") aiCallsAnswered += Number(m.metric_value);
      if (m.metric_key === "messages_sent") aiMessagesSent += Number(m.metric_value);
    }
  } catch {
    // table may not exist for this org pack — ignore
  }

  return {
    revenueThisWeek:      sum(paidThisWeekRes.data),
    revenueLastWeek:      sum(paidLastWeekRes.data),
    newClientsThisWeek:   newClientsThisRes.count ?? 0,
    newClientsLastWeek:   newClientsLastRes.count ?? 0,
    invoicesSentThisWeek: invSentRes.count ?? 0,
    invoicesPaidThisWeek: invPaidCountRes.count ?? 0,
    outstandingAR:        sum(outstanding),
    overdueAR:            sum(overdue),
    overdueCount:         overdue.length,
    openEstimatesValue:   sum(estimatesRes.data),
    openEstimatesCount:   (estimatesRes.data ?? []).length,
    tasksCompletedThisWeek: tasksCompletedRes.count ?? 0,
    tasksCreatedThisWeek:   tasksCreatedRes.count ?? 0,
    appointmentsNextWeek:   apptRes.count ?? 0,
    aiCallsAnswered,
    aiMessagesSent,
  };
}


/**
 * Generate (and persist) a weekly business-insights digest for an org.
 * Idempotent per (org, week-start): re-running overwrites the same row.
 */
export async function generateBusinessInsight(
  db: SupabaseClient,
  orgId: string,
  now: Date,
  reader: InsightReader
): Promise<{ ok: boolean; insight?: BusinessInsight; error?: string }> {
  const t = translatorFor(reader.locale, "home");
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: t("weeklyInsights.errors.notConfigured") };
  }

  // "Today is …" and the week's bounds, in the org's own day.
  const periodEnd = calendarDate(reader.timeZone, now);
  const periodStart = addDays(periodEnd, -7);

  const m = await gatherMetrics(db, orgId, now, reader.timeZone);

  const fmt = moneyFormatter(reader.locale, reader.currency, { maximumFractionDigits: 0 });

  const metricsText = [
    `Revenue collected this week: ${fmt(m.revenueThisWeek)} (last week: ${fmt(m.revenueLastWeek)}, change: ${pctChange(m.revenueThisWeek, m.revenueLastWeek, reader.locale)})`,
    `New clients this week: ${m.newClientsThisWeek} (last week: ${m.newClientsLastWeek}, change: ${pctChange(m.newClientsThisWeek, m.newClientsLastWeek, reader.locale)})`,
    `Invoices sent this week: ${m.invoicesSentThisWeek} | paid this week: ${m.invoicesPaidThisWeek}`,
    `Outstanding receivables: ${fmt(m.outstandingAR)} | OVERDUE: ${fmt(m.overdueAR)} across ${m.overdueCount} invoice(s)`,
    `Open estimates: ${m.openEstimatesCount} worth ${fmt(m.openEstimatesValue)} (potential revenue awaiting approval)`,
    `Tasks completed this week: ${m.tasksCompletedThisWeek} | created: ${m.tasksCreatedThisWeek}`,
    `Appointments scheduled next 7 days: ${m.appointmentsNextWeek}`,
    `AI receptionist: ${m.aiCallsAnswered} calls answered, ${m.aiMessagesSent} messages sent this week`,
  ].join("\n");

  // The digest is read by the OWNER, so it goes out in their language; the
  // JSON variant keeps the keys and the `sentiment` enum in English so the
  // parser and the sentiment styling still find what they expect.
  const system = `You are Tim, the AI Chief Information Officer for a small business. You are analytical and plain-spoken — you explain what the data means and what to do about it, not just what it says. Today is ${periodEnd}.${languageDirectiveForJson(
    reader.locale,
  )}`;

  const user = `Analyze this week's business metrics and produce a JSON digest for the owner.

WEEK OF ${periodStart} to ${periodEnd}
${metricsText}

Respond with ONLY valid JSON (no markdown):
{
  "headline": "One punchy sentence summarizing the week (max 100 chars)",
  "summary": "2-3 sentences of plain-English narrative about how the business did this week",
  "insights": [
    {
      "title": "Short insight title",
      "detail": "1-2 sentences explaining the insight and why it matters",
      "sentiment": "positive | neutral | negative",
      "metric": "the key number, e.g. '+23% revenue'",
      "recommendation": "Optional concrete action to take (1 sentence), or omit"
    }
  ]
}

Rules:
- Produce 3-5 insights, ordered by importance.
- Prioritize anything urgent: overdue receivables, declining revenue, stalled estimates.
- Be specific and reference the actual numbers.
- If a metric is zero or flat, only mention it if it's actionable.`;

  let rawText = "";
  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });
    rawText = (resp.content[0] as { type: string; text: string }).text ?? "";
  } catch (e) {
    console.error("[business-insights] Claude error:", e);
    return { ok: false, error: t("weeklyInsights.errors.generateFailed") };
  }

  let parsed: { headline: string; summary: string; insights: InsightItem[] };
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
  } catch {
    return { ok: false, error: t("weeklyInsights.errors.parseFailed") };
  }

  const generatedAt = now.toISOString();

  const { error: upsertErr } = await db.from("business_insights").upsert(
    {
      organization_id:  orgId,
      period_start:     periodStart,
      period_end:       periodEnd,
      headline:         parsed.headline ?? t("weeklyInsights.defaultHeadline"),
      summary:          parsed.summary ?? "",
      insights:         parsed.insights ?? [],
      metrics_snapshot: m,
      model:            "claude-haiku-4-5",
      generated_at:     generatedAt,
    },
    { onConflict: "organization_id,period_start" }
  );

  if (upsertErr) {
    console.error("[business-insights] upsert error:", upsertErr);
    return { ok: false, error: upsertErr.message };
  }

  return {
    ok: true,
    insight: {
      periodStart,
      periodEnd,
      headline: parsed.headline,
      summary: parsed.summary,
      insights: parsed.insights ?? [],
      generatedAt,
    },
  };
}

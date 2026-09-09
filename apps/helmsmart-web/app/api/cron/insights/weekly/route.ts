/**
 * Weekly business insights cron — GET /api/cron/insights/weekly
 *
 * Runs Monday mornings. Generates Tim's weekly digest for every org that has
 * had activity, and bumps Tim's insights_delivered metric.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { generateBusinessInsight } from "@/lib/business-insights";
import { createNotificationService } from "@/lib/actions/notifications";
import { userUiLocale } from "@/lib/i18n/userLocale";
import { translatorFor } from "@/lib/i18n/server";
import { DEFAULT_CURRENCY } from "@/lib/books-format";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  let generated = 0;
  const errors: string[] = [];

  // Cost gate: only generate for live, recently-active accounts.
  const INACTIVE_STATUSES = new Set([
    "canceled", "cancelled", "past_due", "unpaid", "incomplete_expired",
  ]);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  let skipped = 0;

  for (const conn of packServiceConns()) {
    const db = createServiceClientFor(conn);

    const { data: orgs } = await db
      .from("organizations")
      .select("id, subscription_status, currency")
      .limit(500);

    for (const org of orgs ?? []) {
      // 1) Skip churned / unpaid accounts — no point spending tokens on them.
      if (org.subscription_status && INACTIVE_STATUSES.has(org.subscription_status)) {
        skipped++;
        continue;
      }

      // 2) Skip empty accounts.
      const { count: clientCount } = await db
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id);
      if (!clientCount) { skipped++; continue; }

      // 3) Skip dormant accounts — no new client or invoice in the last 30 days.
      //    Tim has nothing fresh to say, so don't burn a Claude call. Short-circuit
      //    on clients (the cheaper signal) before checking invoices.
      const { count: recentClients } = await db
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", thirtyDaysAgo);
      let active = (recentClients ?? 0) > 0;
      if (!active) {
        const { count: recentInvoices } = await db
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .gte("created_at", thirtyDaysAgo);
        active = (recentInvoices ?? 0) > 0;
      }
      if (!active) { skipped++; continue; }

      /*
       * The digest is written FOR the owner, so it is written in the owner's
       * language — there is no cookie behind a cron, so the preference has to
       * be looked up. `organization_members.role = 'owner'` is who that is;
       * a missing row or a missing preference means English, same as before.
       */
      const { data: owner } = await db
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org.id)
        .eq("role", "owner")
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const locale = owner?.user_id ? await userUiLocale(owner.user_id) : null;
      const t = translatorFor(locale, "home");

      const result = await generateBusinessInsight(db, org.id, now, {
        locale,
        currency: (org.currency as string | null) ?? DEFAULT_CURRENCY,
      });
      if (!result.ok) {
        errors.push(`${org.id}: ${result.error}`);
        continue;
      }
      generated++;

      // Bump Tim's insights_delivered metric (best-effort)
      try {
        const { data: tim } = await db
          .from("ai_employees")
          .select("id")
          .eq("organization_id", org.id)
          .eq("slug", "tim")
          .maybeSingle();
        if (tim) {
          const metricDate = now.toISOString().slice(0, 10);
          const { data: existing } = await db
            .from("ai_employee_metrics")
            .select("metric_value")
            .eq("organization_id", org.id)
            .eq("employee_id", tim.id)
            .eq("metric_date", metricDate)
            .eq("metric_key", "insights_delivered")
            .maybeSingle();
          await db.from("ai_employee_metrics").upsert(
            {
              organization_id: org.id,
              employee_id: tim.id,
              metric_date: metricDate,
              metric_key: "insights_delivered",
              metric_value: (Number(existing?.metric_value) || 0) + 1,
            },
            { onConflict: "organization_id,employee_id,metric_date,metric_key" }
          );
        }
      } catch {
        // metrics table may be absent for this pack — ignore
      }

      // Notify the owner. The headline is the digest's own sentence — already
      // written in the owner's language by `generateBusinessInsight`, and not
      // a template — so it carries no key. The stand-in for a missing headline
      // is copy, so that one does.
      const headline = result.insight?.headline;
      await createNotificationService(
        org.id,
        {
          type: "system",
          title: t("weeklyInsights.notification.title"),
          body: headline ?? t("weeklyInsights.notification.body"),
          titleKey: "notifications.events.weeklyInsight",
          bodyKey: headline ? undefined : "notifications.events.weeklyInsightBody",
          link: "/insights",
        },
        db
      );
    }
  }

  return NextResponse.json({ ok: true, generated, skipped, errors });
}

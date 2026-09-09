"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateBusinessInsight, type BusinessInsight, type InsightItem } from "@/lib/business-insights";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";

/**
 * Get the most recent business insight for the current org.
 */
export async function getLatestInsight(): Promise<(BusinessInsight & { isStale: boolean }) | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("business_insights")
    .select("*")
    .eq("organization_id", orgId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const ageDays = (Date.now() - new Date(data.generated_at).getTime()) / 86_400_000;

  return {
    periodStart: data.period_start,
    periodEnd:   data.period_end,
    headline:    data.headline,
    summary:     data.summary,
    insights:    (data.insights ?? []) as InsightItem[],
    generatedAt: data.generated_at,
    isStale:     ageDays > 7,
  };
}

/**
 * Generate a fresh business insight on demand (Tim runs the numbers now).
 */
export async function refreshInsight(): Promise<{ ok: boolean; insight?: BusinessInsight; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("home");
  if (!orgId) return { ok: false, error: t("insights.errors.notAuthenticated") };

  const db = await createServiceClient();
  const result = await generateBusinessInsight(db, orgId, new Date(), {
    locale: await getServerLocale(),
    currency: await orgCurrency(orgId),
  });

  if (result.ok) {
    revalidatePath("/command-center");
    revalidatePath("/insights");
  }
  return result;
}

/**
 * History of past insights for the org.
 */
export async function listInsights(limit = 12) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("business_insights")
    .select("id, period_start, period_end, headline, summary, insights, generated_at")
    .eq("organization_id", orgId)
    .order("period_start", { ascending: false })
    .limit(limit);

  return data ?? [];
}

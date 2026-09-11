import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultAvatarForSeed } from "@helm/ui";
import { getBlueprint } from "@helm/ai-workforce";
import { getWorkforceSummary, getWorkforce } from "@/lib/actions/workforce";
import { createClient } from "@/lib/supabase/server";
import { CommandCenterView } from "./command-center-view";
import { WorkforceBoard } from "./workforce-board";
import { TodaySummary } from "@/components/today-summary";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { orgToday } from "@/lib/org-timezone";
import { addDays } from "@/lib/org-date";
import { moneyFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("home");
  return { title: t("commandCenter.metaTitle") };
}

export default async function CommandCenterPage() {
  const t = await getServerT("home");
  const locale = await getServerLocale();
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const todayStr = await orgToday(orgId);
  const fromStr = addDays(todayStr, -29);

  const [summary, employees, overdueRes, tasksRes, currency, orgRes] = await Promise.all([
    getWorkforceSummary(fromStr, todayStr),
    getWorkforce(),
    supabase.from("invoices").select("id, total").eq("organization_id", orgId).eq("status", "sent").lt("due_date", todayStr),
    supabase.from("tasks").select("id, priority").eq("organization_id", orgId).eq("status", "open"),
    orgCurrency(orgId),
    supabase.from("organizations").select("twilio_number, voice_agent_enabled").eq("id", orgId).maybeSingle(),
  ]);

  // The receptionist answers only with a number to ring AND the agent switched
  // on (`app/api/twilio/voice`). An idle workforce is pointed at her setup
  // unless both are already true.
  const receptionistLive = Boolean(orgRes.data?.twilio_number && orgRes.data?.voice_agent_enabled);

  const fmt = moneyFormatter(locale, currency, { maximumFractionDigits: 0 });
  const overdueInvoices = overdueRes.data ?? [];
  const allTasks = tasksRes.data ?? [];
  const todayData = {
    overdueInvoices: overdueInvoices.length,
    overdueTotal: fmt(overdueInvoices.reduce((s, i) => s + Number(i.total), 0)),
    openTasks: allTasks.length,
    urgentTasks: allTasks.filter((t) => t.priority === "urgent" || t.priority === "high").length,
  };

  // Each employee's avatar: their chosen one → the role-fit default from the roster
  // blueprint → a stable hash fallback (for non-roster employees).
  const avatarById: Record<string, string> = Object.fromEntries(
    employees.map((e) => [
      e.id,
      e.avatar ?? getBlueprint(e.slug)?.avatar ?? defaultAvatarForSeed(e.slug),
    ])
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("commandCenter.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("commandCenter.subtitle")}</p>
      </div>

      <CommandCenterView summary={summary} receptionistLive={receptionistLive} />

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("commandCenter.workforceHeading")}</h2>
        <WorkforceBoard summary={summary} avatarById={avatarById} />
      </div>

      <TodaySummary data={todayData} />
    </div>
  );
}

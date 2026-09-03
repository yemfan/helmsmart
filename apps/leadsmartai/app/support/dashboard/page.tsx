import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { getServerT } from "@/lib/i18n/server";

const tickets = [
  { name: "Michael Ye", subject: "Billing question", priority: "high", unread: 2 },
  { name: "Sarah Chen", subject: "Home Value tool issue", priority: "urgent", unread: 1 },
  { name: "David Lin", subject: "Cannot access dashboard", priority: "normal", unread: 0 },
];

export const metadata = {
  title: "Support Dashboard",
  description: "Tickets, conversations, and operations for platform support.",
};

export default async function SupportDashboardPage() {
  const t = await getServerT();
  return (
    <DashboardShell
      title={t("pages.supportDash.title", { ns: "dashboard" })}
      subtitle={t("pages.supportDash.pageSubtitle", { ns: "dashboard" })}
      kpis={
        <>
          <KpiCard label={t("pages.supportDash.openTickets", { ns: "dashboard" })} value="24" subtext="+4 today" />
          <KpiCard label={t("pages.supportDash.urgentTickets", { ns: "dashboard" })} value="3" subtext="Need immediate review" />
          <KpiCard label={t("pages.supportDash.waiting", { ns: "dashboard" })} value="11" subtext="SLA at risk" />
          <KpiCard label={t("pages.supportDash.avgResponse", { ns: "dashboard" })} value="4m" subtext="Last 24 hours" />
          <KpiCard label={t("pages.supportDash.resolvedToday", { ns: "dashboard" })} value="17" subtext="Strong pace" />
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t("pages.supportDash.ticketQueue", { ns: "dashboard" })}>
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.name + ticket.subject}
                className="flex items-center justify-between rounded-xl border p-4"
              >
                <div>
                  <div className="font-medium text-gray-900">{ticket.name}</div>
                  <div className="text-sm text-gray-500">{ticket.subject}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-gray-700">{ticket.priority}</div>
                  <div className="text-gray-400">{t("pages.dashFragments.unread", { ns: "dashboard" })} {ticket.unread}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("pages.supportDash.quickActions", { ns: "dashboard" })}>
          <div className="grid gap-3">
            <button className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white">{t("pages.supportDash.assignToMe", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.supportDash.markUrgent", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.supportDash.markResolved", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.supportDash.tagBilling", { ns: "dashboard" })}</button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title={t("pages.supportDash.activeConversation", { ns: "dashboard" })}>
          <div className="space-y-3">
            <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">{t("pages.supportDash.sampleCustomer", { ns: "dashboard" })}</div>
            <div className="rounded-xl bg-gray-900 p-4 text-sm text-white">{t("pages.supportDash.sampleSupport", { ns: "dashboard" })}</div>
            <textarea
              rows={4}
              className="w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
              placeholder={t("pages.supportDash.writeReply", { ns: "dashboard" })}
            />
          </div>
        </SectionCard>

        <SectionCard title={t("pages.supportDash.internalNotes", { ns: "dashboard" })}>
          <div className="space-y-3">
            <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-900">{t("pages.supportDash.sampleNote1", { ns: "dashboard" })}</div>
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{t("pages.supportDash.sampleNote2", { ns: "dashboard" })}</div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title={t("pages.supportDash.issueTrends", { ns: "dashboard" })}>
          <ul className="space-y-3 text-sm text-gray-700">
            <li>{t("pages.supportDash.homeValueReports", { ns: "dashboard" })}</li>
            <li>{t("pages.supportDash.billingIssues", { ns: "dashboard" })}</li>
            <li>{t("pages.supportDash.loginFlat", { ns: "dashboard" })}</li>
          </ul>
        </SectionCard>

        <SectionCard title={t("pages.supportDash.teamWorkload", { ns: "dashboard" })}>
          <ul className="space-y-3 text-sm text-gray-700">
            <li>{t("pages.supportDash.workload1", { ns: "dashboard" })}</li>
            <li>{t("pages.supportDash.workload2", { ns: "dashboard" })}</li>
            <li>{t("pages.supportDash.workload3", { ns: "dashboard" })}</li>
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

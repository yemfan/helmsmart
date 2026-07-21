import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";

const tickets = [
  { name: "Michael Ye", subject: "Billing question", priority: "high", unread: 2 },
  { name: "Sarah Chen", subject: "Home Value tool issue", priority: "urgent", unread: 1 },
  { name: "David Lin", subject: "Cannot access dashboard", priority: "normal", unread: 0 },
];

export const metadata = {
  title: "Support Dashboard | CloseBoss",
  description: "Tickets, conversations, and operations for platform support.",
};

export default function SupportDashboardPage() {
  return (
    <DashboardShell
      title="System Support Dashboard"
      subtitle="Resolve issues faster and keep the platform running smoothly."
      kpis={
        <>
          <KpiCard label="Open Tickets" value="24" subtext="+4 today" />
          <KpiCard label="Urgent Tickets" value="3" subtext="Need immediate review" />
          <KpiCard label="Waiting on Support" value="11" subtext="SLA at risk" />
          <KpiCard label="Avg Response Time" value="4m" subtext="Last 24 hours" />
          <KpiCard label="Resolved Today" value="17" subtext="Strong pace" />
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Ticket Queue">
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
                  <div className="text-gray-400">Unread {ticket.unread}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Quick Actions">
          <div className="grid gap-3">
            <button className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white">
              Assign to Me
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Mark Urgent
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Mark Resolved
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Tag as Billing / Bug
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Active Conversation">
          <div className="space-y-3">
            <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              Customer: The Home Value tool is not loading on my page.
            </div>
            <div className="rounded-xl bg-gray-900 p-4 text-sm text-white">
              Support: Thanks for reporting this. Can you share the page URL?
            </div>
            <textarea
              rows={4}
              className="w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
              placeholder="Write reply..."
            />
          </div>
        </SectionCard>

        <SectionCard title="Internal Notes">
          <div className="space-y-3">
            <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-900">
              Possible regression after latest deploy.
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              Customer is high-value agent account.
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Issue Trends">
          <ul className="space-y-3 text-sm text-gray-700">
            <li>4 reports for Home Value tool today</li>
            <li>2 billing issues since last deploy</li>
            <li>Login issue volume flat</li>
          </ul>
        </SectionCard>

        <SectionCard title="Team Workload">
          <ul className="space-y-3 text-sm text-gray-700">
            <li>Ava - 6 active tickets</li>
            <li>David - 4 active tickets</li>
            <li>Jess - 3 urgent tickets handled today</li>
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

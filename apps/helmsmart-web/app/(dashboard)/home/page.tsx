import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listProjectsPnL } from "@/lib/actions/projects";
import {
  DollarSign, TrendingUp, TrendingDown, FileText,
  Users, Plus, ArrowRight, Building2,
  CheckSquare, Clock, CalendarDays, AlertCircle,
  FolderOpen, Timer, Wallet, AlertTriangle,
  GitBranch, FileInput,
} from "lucide-react";
import { RevenueChart, type ChartMonth } from "@/components/revenue-chart";
import { getReceivablesAging, getCashFlowForecast } from "@/lib/actions/reports";
import { getOrCreateDailyBriefing } from "@/lib/briefing";

export const metadata: Metadata = { title: "Dashboard" };

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getDashboardData(orgId: string) {
  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  // 6-month window for chart
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);

  // Upcoming window: today → 7 days out
  const sevenDaysOut = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
    .toISOString()
    .slice(0, 10);

  const [
    bankRes,
    mtdTxnRes,
    invoiceRes,
    clientsRes,
    chartTxnRes,
    recentInvRes,
    recentClientsRes,
    openTasksRes,
    upcomingEventsRes,
    activeProjectsPnL,
    uninvoicedTimeRes,
    receivables,
    forecast,
    unreadMsgRes,
    pendingApprovalsRes,
    recentSubmissionsRes,
  ] = await Promise.all([
    // Bank balances
    supabase
      .from("bank_accounts")
      .select("current_balance, type")
      .eq("organization_id", orgId)
      .eq("is_active", true),

    // MTD transactions
    supabase
      .from("bank_transactions")
      .select("amount")
      .eq("organization_id", orgId)
      .eq("pending", false)
      .gte("date", monthStart)
      .lte("date", todayStr),

    // Outstanding invoices
    supabase
      .from("invoices")
      .select("total, status, due_date")
      .eq("organization_id", orgId)
      .in("status", ["sent", "overdue"]),

    // Client counts
    supabase
      .from("clients")
      .select("status", { count: "exact" })
      .eq("organization_id", orgId),

    // 6-month transactions for chart
    supabase
      .from("bank_transactions")
      .select("date, amount")
      .eq("organization_id", orgId)
      .eq("pending", false)
      .gte("date", sixMonthsAgo)
      .lte("date", todayStr),

    // Recent invoices
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date, clients(first_name, last_name, company)")
      .eq("organization_id", orgId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(5),

    // Recent clients
    supabase
      .from("clients")
      .select("id, first_name, last_name, company, status, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),

    // Open tasks (overdue + due this week)
    supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, client_id, clients(first_name, last_name, company)")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .lte("due_date", sevenDaysOut)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),

    // Upcoming calendar events (next 7 days)
    supabase
      .from("events")
      .select("id, title, type, color, start_at, all_day, clients(first_name, last_name)")
      .eq("organization_id", orgId)
      .eq("completed", false)
      .gte("start_at", new Date().toISOString())
      .lte("start_at", new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 23, 59).toISOString())
      .order("start_at", { ascending: true })
      .limit(6),

    // Active projects with P&L (Week 32)
    listProjectsPnL("active"),

    // Uninvoiced billable time (all time)
    supabase
      .from("time_entries")
      .select("duration_minutes, hourly_rate")
      .eq("organization_id", orgId)
      .eq("billable", true)
      .eq("invoiced", false)
      .not("ended_at", "is", null),

    // A/R aging + cash-flow forecast (Weeks 37–40)
    getReceivablesAging(),
    getCashFlowForecast(),

    // Unread inbound messages (for the daily briefing)
    supabase
      .from("messages")
      .select("priority")
      .eq("organization_id", orgId)
      .eq("direction", "inbound")
      .eq("read", false),

    // Pending approval requests
    supabase
      .from("approval_requests")
      .select("id, subject_label, requested_at")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(5),

    // Recent form submissions (last 7 days)
    supabase
      .from("form_submissions")
      .select("id, name, email, form_id, created_at, form_definitions(title)")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Bank balance
  const accounts = bankRes.data ?? [];
  const bankBalance = accounts.length
    ? accounts.reduce((s, a) => {
        const b = a.current_balance ?? 0;
        return a.type === "credit" ? s - b : s + b;
      }, 0)
    : null;

  // MTD figures
  const mtdTxns = mtdTxnRes.data ?? [];
  let mtdRevenue = 0;
  let mtdExpenses = 0;
  for (const t of mtdTxns) {
    if (t.amount < 0) mtdRevenue += Math.abs(t.amount);
    else mtdExpenses += t.amount;
  }

  // Outstanding invoices
  const outstanding = invoiceRes.data ?? [];
  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total), 0);
  const overdueCount = outstanding.filter(
    (i) => i.status === "overdue" || (i.status === "sent" && i.due_date < todayStr)
  ).length;

  // Client counts
  const clients = clientsRes.data ?? [];
  const activeClients = clients.filter((c) => c.status === "active").length;
  const totalClients = clients.length;

  // Chart data — group by YYYY-MM, then build 6-month labels
  const chartTxns = chartTxnRes.data ?? [];
  const monthMap = new Map<string, { revenue: number; expenses: number }>();
  for (const t of chartTxns) {
    const key = t.date.slice(0, 7); // YYYY-MM
    const cur = monthMap.get(key) ?? { revenue: 0, expenses: 0 };
    if (t.amount < 0) cur.revenue += Math.abs(t.amount);
    else cur.expenses += t.amount;
    monthMap.set(key, cur);
  }

  const chartData: ChartMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const { revenue = 0, expenses = 0 } = monthMap.get(key) ?? {};
    chartData.push({ month: label, revenue, expenses });
  }

  // Uninvoiced time totals
  const uninvEntries = uninvoicedTimeRes.data ?? [];
  let uninvoicedMinutes = 0;
  let uninvoicedAmount = 0;
  for (const e of uninvEntries) {
    const mins = e.duration_minutes ?? 0;
    uninvoicedMinutes += mins;
    uninvoicedAmount += (mins / 60) * Number(e.hourly_rate ?? 0);
  }

  // Active-project profit (Week 32)
  const activeProfit = activeProjectsPnL.reduce((s, p) => s + p.pnl.profit, 0);
  const activeProjectsHasPnL = activeProjectsPnL.some(
    (p) => p.pnl.revenue > 0 || p.pnl.profit !== 0
  );

  // Unread / urgent inbound messages (for the daily briefing)
  const unreadMsgs = unreadMsgRes.data ?? [];
  const unreadMessages = unreadMsgs.length;
  const urgentMessages = unreadMsgs.filter((m) => m.priority === "high").length;

  return {
    bankBalance,
    mtdRevenue: mtdTxns.length ? mtdRevenue : null,
    mtdExpenses: mtdTxns.length ? mtdExpenses : null,
    totalOutstanding,
    overdueCount,
    outstandingCount: outstanding.length,
    activeClients,
    totalClients,
    chartData,
    recentInvoices: recentInvRes.data ?? [],
    recentClients: recentClientsRes.data ?? [],
    openTasks: openTasksRes.data ?? [],
    upcomingEvents: upcomingEventsRes.data ?? [],
    activeProjects: activeProjectsPnL.slice(0, 6),
    activeProfit,
    activeProjectsHasPnL,
    uninvoicedMinutes,
    uninvoicedAmount,
    unreadMessages,
    urgentMessages,
    receivables,
    forecast,
    todayStr,
    pendingApprovals: pendingApprovalsRes.data ?? [],
    recentSubmissions: recentSubmissionsRes.data ?? [],
  };
}

// ─── Status colors ────────────────────────────────────────────────────────────

const INV_STATUS: Record<string, string> = {
  draft:   "bg-slate-100 text-slate-600",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
};

const CLIENT_STATUS: Record<string, string> = {
  lead:     "bg-slate-100 text-slate-600",
  prospect: "bg-blue-100 text-blue-700",
  active:   "bg-emerald-100 text-emerald-700",
  inactive: "bg-amber-100 text-amber-700",
};

const COLOR_DOTS: Record<string, string> = {
  indigo:  "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose:    "bg-rose-500",
  amber:   "bg-amber-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";

  const {
    bankBalance,
    mtdRevenue,
    mtdExpenses,
    totalOutstanding,
    overdueCount,
    outstandingCount,
    activeClients,
    totalClients,
    chartData,
    recentInvoices,
    recentClients,
    openTasks,
    upcomingEvents,
    activeProjects,
    activeProfit,
    activeProjectsHasPnL,
    uninvoicedMinutes,
    uninvoicedAmount,
    unreadMessages,
    urgentMessages,
    receivables,
    forecast,
    todayStr,
    pendingApprovals,
    recentSubmissions,
  } = await getDashboardData(orgId);

  const cashOnHand      = forecast.startingBalance;
  const expectedIn      = forecast.totalInflow;
  const expectedOut     = forecast.totalOutflow;
  const projected90     = forecast.endingBalance;
  const lowestProjected = forecast.lowestBalance;
  const overdueAR       = receivables.overdueAmount;
  const dueNowAP        = forecast.periods[0]?.outflow ?? 0;
  const showCashFlow    = forecast.hasBank || expectedIn > 0 || expectedOut > 0;

  const tasksOverdue  = openTasks.filter((t) => t.due_date && t.due_date < todayStr).length;
  const tasksDueToday = openTasks.filter((t) => t.due_date === todayStr).length;
  const briefing = await getOrCreateDailyBriefing(orgId, {
    overdueCount,
    overdueAmount: overdueAR,
    unreadMessages,
    urgentMessages,
    tasksOverdue,
    tasksDueToday,
    lowestProjectedCash: showCashFlow ? lowestProjected : null,
    uninvoicedAmount,
  });

  const today = new Date();
  const hour = today.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const kpis = [
    {
      label: "Bank Balance",
      value: fmt(bankBalance),
      icon: DollarSign,
      sub: bankBalance === null ? "Link a bank account" : "All connected accounts",
      color: "text-slate-400",
      href: "/books",
    },
    {
      label: "Revenue (MTD)",
      value: fmt(mtdRevenue),
      icon: TrendingUp,
      sub: today.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      color: "text-emerald-500",
      href: "/books",
    },
    {
      label: "Expenses (MTD)",
      value: fmt(mtdExpenses),
      icon: TrendingDown,
      sub: today.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      color: "text-rose-500",
      href: "/books",
    },
    {
      label: "Outstanding",
      value: fmt(totalOutstanding),
      icon: FileText,
      sub: `${outstandingCount} invoice${outstandingCount !== 1 ? "s" : ""}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`,
      color: overdueCount > 0 ? "text-rose-500" : "text-amber-500",
      href: "/books/invoices",
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{greeting} 👋</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeClients} active client{activeClients !== 1 ? "s" : ""} · {totalClients} total
          </p>

          {/*
            The daily briefing, as text.

            It used to be a full-width card in an indigo-to-violet gradient with
            white type — the only element on the page painted that way, so the
            eye landed first on a sentence that most days reports nothing needs
            doing. It read as decoration rather than information. Under the
            client counts it says the same thing in the page's own voice, and
            the KPI cards below it get to be what the page leads with.
          */}
          <p className="text-sm text-slate-600 mt-3 max-w-2xl">{briefing.headline}</p>
          {briefing.actions.length > 0 && (
            <ul className="mt-2 space-y-1 max-w-2xl">
              {briefing.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-500">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/books/invoices/new"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New invoice
          </Link>
          <Link
            href="/clients"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Users className="w-4 h-4" />
            Clients
          </Link>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, sub, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {label}
              </span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-semibold text-slate-800 font-mono mb-1">
              {value}
            </div>
            <div className="text-xs text-slate-400">{sub}</div>
          </Link>
        ))}
      </div>

      {/* ── Revenue chart ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Revenue vs Expenses</h2>
            <p className="text-xs text-slate-400 mt-0.5">Last 6 months</p>
          </div>
          <Link
            href="/reports"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            Full report
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="h-48">
          <RevenueChart data={chartData} />
        </div>
      </div>

      {/* ── Cash Flow Outlook (Week 41) ── */}
      {showCashFlow && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800">Cash Flow Outlook</h2>
            </div>
            <Link
              href="/reports?tab=forecast"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              View forecast <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {/* Cash on hand */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Cash on hand</p>
              <p className="text-xl font-semibold text-slate-800 tabular-nums">{fmt(cashOnHand)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{forecast.hasBank ? "Linked accounts" : "Link a bank"}</p>
            </div>

            {/* Expected in (A/R) */}
            <Link href="/reports?tab=receivables" className="block hover:opacity-80 transition-opacity">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Expected in</p>
              <p className="text-xl font-semibold text-emerald-600 tabular-nums">{fmt(expectedIn)}</p>
              <p className={`text-xs mt-0.5 ${overdueAR > 0 ? "text-rose-500" : "text-slate-400"}`}>
                {overdueAR > 0 ? `${fmt(overdueAR)} overdue` : "Open invoices"}
              </p>
            </Link>

            {/* Expected out (A/P) */}
            <Link href="/books/bills" className="block hover:opacity-80 transition-opacity">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Expected out</p>
              <p className="text-xl font-semibold text-rose-600 tabular-nums">{fmt(expectedOut)}</p>
              <p className={`text-xs mt-0.5 ${dueNowAP > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {dueNowAP > 0 ? `${fmt(dueNowAP)} due now` : "Open bills"}
              </p>
            </Link>

            {/* Projected 90-day */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Projected (90d)</p>
              <p className={`text-xl font-semibold tabular-nums ${projected90 >= 0 ? "text-slate-800" : "text-rose-600"}`}>
                {fmt(projected90)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">After open items</p>
            </div>
          </div>

          {lowestProjected < 0 && (
            <div className="flex items-start gap-2 mt-4 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700">
                Projected cash dips to{" "}
                <span className="font-semibold tabular-nums">{fmt(lowestProjected)}</span>{" "}
                within 90 days. Prioritize collections on overdue invoices or delay non-urgent bills.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Active Projects + Uninvoiced Time ── */}
      <div className="grid grid-cols-3 gap-6">
        {/* Active projects — spans 2 cols */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Active Projects</h2>
                {activeProjectsHasPnL && (
                  <p className={`text-xs font-medium ${activeProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmt(activeProfit)} profit
                  </p>
                )}
              </div>
            </div>
            <Link
              href="/projects"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {activeProjects.length === 0 ? (
            <div className="py-10 text-center">
              <FolderOpen className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400 mb-3">No active projects</p>
              <Link
                href="/projects"
                className="text-xs text-indigo-600 font-medium hover:text-indigo-800"
              >
                Create a project →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {activeProjects.map((proj) => {
                const daysLeft = proj.end_date
                  ? Math.ceil((new Date(proj.end_date + "T00:00:00").getTime() - Date.now()) / 86400000)
                  : null;
                const isOverdue = daysLeft !== null && daysLeft < 0;
                const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

                return (
                  <Link
                    key={proj.id}
                    href={`/projects/${proj.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${COLOR_DOTS[proj.color as string] ?? "bg-indigo-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{proj.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {proj.budget_hours ? `${proj.budget_hours}h budget` : "No budget"}
                        {proj.pnl.profit !== 0 && (
                          <span className={proj.pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {" · "}{fmt(proj.pnl.profit)} profit
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      {proj.pnl.margin !== null && (
                        <span className={`text-xs font-semibold ${proj.pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {(proj.pnl.margin * 100).toFixed(0)}%
                        </span>
                      )}
                      {daysLeft !== null && (
                        <span className={`text-xs font-medium ${
                          isOverdue ? "text-rose-600" : isDueSoon ? "text-amber-600" : "text-slate-400"
                        }`}>
                          {isOverdue
                            ? `${Math.abs(daysLeft)}d overdue`
                            : daysLeft === 0
                            ? "Due today"
                            : `${daysLeft}d left`
                          }
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Uninvoiced time widget */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Timer className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800">Uninvoiced Time</h2>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 text-center">
            {uninvoicedMinutes === 0 ? (
              <>
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckSquare className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">All time invoiced</p>
                <p className="text-xs text-slate-400 mt-1">No billable hours waiting to be billed.</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mb-1">
                  {fmt(uninvoicedAmount)}
                </p>
                <p className="text-sm text-slate-500 mb-1">
                  {fmtHours(uninvoicedMinutes)} billable
                </p>
                <p className="text-xs text-slate-400 mb-4">not yet invoiced</p>
                <Link
                  href="/timesheets"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  Go to Timesheets <ArrowRight className="w-3 h-3" />
                </Link>
              </>
            )}
          </div>

          {uninvoicedMinutes > 0 && (
            <div className="px-5 pb-4">
              <Link
                href="/books/invoices/new"
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create invoice
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent invoices */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Recent Invoices</h2>
            <Link
              href="/books/invoices"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {!recentInvoices.length ? (
            <div className="py-10 text-center">
              <FileText className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No invoices yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentInvoices.map((inv) => {
                const clientRaw = inv.clients;
                const client = (
                  Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
                ) as {
                  first_name: string | null;
                  last_name: string | null;
                  company: string | null;
                } | null;
                const clientName = client
                  ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
                    client.company ||
                    "—"
                  : "—";

                const effectiveStatus =
                  inv.status === "sent" && inv.due_date < todayStr
                    ? "overdue"
                    : inv.status;

                return (
                  <Link
                    key={inv.id}
                    href={`/books/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {clientName}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">
                        {inv.invoice_number} · {fmtDate(inv.due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">
                        {fmt(Number(inv.total))}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                          INV_STATUS[effectiveStatus] ?? INV_STATUS.draft
                        }`}
                      >
                        {effectiveStatus}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent clients */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Recent Clients</h2>
            <Link
              href="/clients"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {!recentClients.length ? (
            <div className="py-10 text-center">
              <Users className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No clients yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentClients.map((client) => {
                const name =
                  [client.first_name, client.last_name].filter(Boolean).join(" ") ||
                  client.company ||
                  "—";
                return (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {name}
                      </p>
                      <p className="text-xs text-slate-400">
                        Added {fmtDate(client.created_at.slice(0, 10))}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${
                        CLIENT_STATUS[client.status] ?? CLIENT_STATUS.lead
                      }`}
                    >
                      {client.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Approvals + Form Submissions ── */}
      {(pendingApprovals.length > 0 || recentSubmissions.length > 0) && (
        <div className="grid grid-cols-2 gap-6">
          {/* Pending approvals */}
          {pendingApprovals.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-amber-900">
                    Pending Approvals
                    <span className="ml-1.5 text-xs font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded-full">
                      {pendingApprovals.length}
                    </span>
                  </h2>
                </div>
                <Link
                  href="/workflows/requests?status=pending"
                  className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-amber-100">
                {pendingApprovals.map((req) => (
                  <Link
                    key={req.id}
                    href={`/workflows/requests/${req.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-amber-100 transition-colors"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-900 truncate">{req.subject_label}</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {new Date(req.requested_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 flex-shrink-0">Review →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent form submissions */}
          {recentSubmissions.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileInput className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-semibold text-slate-800">Recent Form Leads</h2>
                </div>
                <Link
                  href="/forms"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  All forms <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {recentSubmissions.map((sub) => {
                  const formRaw = sub.form_definitions;
                  const formTitle = (Array.isArray(formRaw) ? formRaw[0] : formRaw)?.title ?? "Form";
                  return (
                    <Link
                      key={sub.id}
                      href={`/forms/${sub.form_id}/submissions`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-600">
                        {(sub.name || sub.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {sub.name || sub.email || "Anonymous"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{formTitle}</p>
                      </div>
                      <p className="text-[11px] text-slate-400 flex-shrink-0">
                        {new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tasks + Events ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Open tasks due this week */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800">Upcoming Tasks</h2>
            </div>
            <Link
              href="/tasks"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {openTasks.length === 0 ? (
            <div className="py-10 text-center">
              <CheckSquare className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No tasks due this week</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {openTasks.map((task) => {
                const clientRaw = task.clients;
                const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
                  first_name: string | null; last_name: string | null; company: string | null;
                } | null;
                const clientName = client
                  ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company
                  : null;

                const isOverdue = task.due_date && task.due_date < todayStr;
                const isToday = task.due_date === todayStr;

                return (
                  <Link
                    key={task.id}
                    href="/tasks"
                    className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 ${
                      task.priority === "urgent" ? "border-rose-400" :
                      task.priority === "high"   ? "border-amber-400" :
                      "border-slate-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{task.title}</p>
                      {clientName && (
                        <p className="text-xs text-slate-400 truncate">{clientName}</p>
                      )}
                    </div>
                    {task.due_date && (
                      <div className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium ${
                        isOverdue ? "text-rose-600" : isToday ? "text-amber-600" : "text-slate-400"
                      }`}>
                        {isOverdue
                          ? <AlertCircle className="w-3 h-3" />
                          : <Clock className="w-3 h-3" />
                        }
                        {isOverdue ? "Overdue" : isToday ? "Today" : fmtDate(task.due_date)}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming calendar events */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800">Upcoming Events</h2>
            </div>
            <Link
              href="/calendar"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              Calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarDays className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No events in the next 7 days</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {upcomingEvents.map((evt) => {
                const clientRaw = evt.clients;
                const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
                  first_name: string | null; last_name: string | null;
                } | null;
                const clientName = client
                  ? [client.first_name, client.last_name].filter(Boolean).join(" ")
                  : null;

                const evtDate = new Date(evt.start_at);
                const evtDateStr = evtDate.toISOString().slice(0, 10);
                const isEvtToday = evtDateStr === todayStr;
                const timeStr = evt.all_day
                  ? "All day"
                  : evtDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                return (
                  <Link
                    key={evt.id}
                    href="/calendar"
                    className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${COLOR_DOTS[evt.color as string] ?? "bg-indigo-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{evt.title}</p>
                      {clientName && (
                        <p className="text-xs text-slate-400 truncate">{clientName}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className={`text-xs font-medium ${isEvtToday ? "text-amber-600" : "text-slate-500"}`}>
                        {isEvtToday ? "Today" : fmtDate(evtDateStr)}
                      </p>
                      <p className="text-[10px] text-slate-400">{timeStr}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listClientsPnL } from "@/lib/actions/projects";
import {
  ArrowLeft, Mail, Phone, Building2, Calendar,
  FileText, MessageSquare, Tag, DollarSign, Receipt, Printer,
} from "lucide-react";
import { ClientEditForm } from "./client-edit-form";
import { EditClientButton } from "./edit-client-button";
import { PortalLinkButton } from "./portal-link-button";
import { ClientNotesPanel } from "@/components/client-notes-panel";
import { EligibilityPanel } from "@/components/eligibility-panel";
import { ClientTimelinePanel } from "@/components/client-timeline-panel";
import { CommunicationPreferences } from "@/components/communication-preferences";
import { ClientAIBrief } from "@/components/client-ai-brief";
import { getActivePack } from "@/lib/packs";
import { getClientCommunications, getClientPreferences } from "@/lib/actions/communication-logs";
import { getClientBrief } from "@/lib/actions/client-brief";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("clients");
  return { title: t("meta.detailTitle") };
}

const STATUS_COLORS: Record<string, string> = {
  lead:     "bg-slate-100 text-slate-600",
  prospect: "bg-blue-100 text-blue-700",
  active:   "bg-emerald-100 text-emerald-700",
  inactive: "bg-amber-100 text-amber-700",
  archived: "bg-red-100 text-red-700",
};

const INV_STATUS_COLORS: Record<string, string> = {
  draft:   "bg-slate-100 text-slate-500",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
  void:    "bg-slate-100 text-slate-400",
};

const EST_STATUS_COLORS: Record<string, string> = {
  draft:    "bg-slate-100 text-slate-500",
  sent:     "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
  expired:  "bg-amber-100 text-amber-700",
};

const PROJECT_COLOR_DOTS: Record<string, string> = {
  indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500",
  amber: "bg-amber-500", violet: "bg-violet-500", slate: "bg-slate-400",
};

const TASK_PRIORITY_DOTS: Record<string, string> = {
  urgent: "bg-rose-500", high: "bg-amber-500", normal: "bg-slate-300", low: "bg-slate-200",
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function fmt(n: number, locale: string) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(n);
}

function timeAgo(iso: string, t: Translate, locale: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return t("time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("time.daysAgo", { n: d });
  return new Date(iso).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" });
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getServerT("clients"), getServerLocale()]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [clientRes, invoicesRes, messagesRes, notesRes, clientsPnL, estimatesRes, projectsRes, tasksRes, commLogs, commPrefs, aiBrief] = await Promise.all([
    supabase
      .from("clients")
      .select("*, portal_token")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, paid_at")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("messages")
      .select("id, channel, direction, subject, body, sent_at, read")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .order("sent_at", { ascending: false })
      .limit(10),
    supabase
      .from("client_notes")
      .select("id, body, kind, created_at")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    listClientsPnL(),
    supabase
      .from("estimates")
      .select("id, estimate_number, status, issue_date, expiry_date, total")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("id, name, status, color")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("tasks")
      .select("id, title, due_date, status, priority")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10),
    getClientCommunications(id, 50),
    getClientPreferences(id),
    getClientBrief(id),
  ]);

  if (!clientRes.data) notFound();
  const notes = notesRes.data ?? [];
  const client = clientRes.data;
  const invoices = invoicesRes.data ?? [];
  const messages = messagesRes.data ?? [];
  const estimates = estimatesRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const pnl = clientsPnL.find((c) => c.clientId === id) ?? null;

  // Insurance eligibility is a DoctorSmart (medical pack) feature.
  const pack = await getActivePack();
  const isMedical = pack.id === "medical";
  const { data: latestEligibility } = isMedical
    ? await supabase
        .from("eligibility_checks")
        .select("status, plan_name, copay, coinsurance, deductible, deductible_remaining, error, checked_at")
        .eq("client_id", id)
        .eq("organization_id", orgId)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const today = new Date().toISOString().slice(0, 10);
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ");
  const displayName = fullName || client.company || t("detail.fallbackName");

  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0);

  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-8">
        <Link
          href="/clients"
          className="mt-1 p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900">{displayName}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[client.status] ?? STATUS_COLORS.lead}`}>
              {t(`statuses.${client.status}`, { defaultValue: client.status })}
            </span>
          </div>
          {client.company && fullName && (
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {client.company}
            </p>
          )}
        </div>
        {/* Quick actions */}
        <div className="flex gap-2">
          <EditClientButton
            clientId={client.id}
            initialValues={{
              first_name: client.first_name ?? "",
              last_name: client.last_name ?? "",
              company: client.company ?? "",
              email: client.email ?? "",
              phone: client.phone ?? "",
              status: client.status,
              source: client.source ?? "",
              notes: client.notes ?? "",
              tags: (client.tags as string[] | null)?.join(", ") ?? "",
            }}
          />
          {client.email && (
            <Link
              href={`/inbox?compose=${encodeURIComponent(client.email)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> {t("detail.actions.sendEmail")}
            </Link>
          )}
          {client.portal_token && (
            <PortalLinkButton portalToken={client.portal_token} />
          )}
          <Link
            href={`/clients/${id}/statement`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> {t("detail.actions.statement")}
          </Link>
          <Link
            href={`/books/expenses/new`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" /> {t("detail.actions.addExpense")}
          </Link>
          <Link
            href={`/books/invoices/new?client=${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> {t("detail.actions.newInvoice")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("detail.stats.lifetimeValue"), value: fmt(totalPaid, locale), icon: DollarSign, color: "text-emerald-500" },
              { label: t("detail.stats.outstanding"),   value: fmt(totalOutstanding, locale), icon: FileText,  color: "text-blue-500" },
              { label: t("detail.stats.invoices"),      value: String(invoices.length), icon: FileText, color: "text-slate-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className="text-lg font-semibold text-slate-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Profitability (Week 33) */}
          {pnl && (pnl.revenue > 0 || pnl.laborCost > 0 || pnl.expensesTotal > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">{t("detail.profitability.title")}</h2>
                {pnl.margin !== null && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pnl.profit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {t("detail.profitability.margin", { pct: (pnl.margin * 100).toFixed(0) })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("detail.profitability.revenue")}</p>
                  <p className="text-lg font-semibold text-slate-800 mt-1 tabular-nums">{fmt(pnl.revenue, locale)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("detail.profitability.labor")}</p>
                  <p className="text-lg font-semibold text-slate-600 mt-1 tabular-nums">−{fmt(pnl.laborCost, locale)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("detail.profitability.expenses")}</p>
                  <p className="text-lg font-semibold text-slate-600 mt-1 tabular-nums">−{fmt(pnl.expensesTotal, locale)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("detail.profitability.profit")}</p>
                  <p className={`text-lg font-semibold mt-1 tabular-nums ${pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(pnl.profit, locale)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                {t("detail.profitability.note")}
              </p>
            </div>
          )}

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.invoices.title")}</h2>
              <Link
                href={`/books/invoices/new?client=${id}`}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {t("detail.actions.new")}
              </Link>
            </div>

            {invoices.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">{t("detail.invoices.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {invoices.map((inv) => {
                  const effectiveStatus =
                    inv.status === "sent" && inv.due_date < today ? "overdue" : inv.status;
                  return (
                    <Link
                      key={inv.id}
                      href={`/books/invoices/${inv.id}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span className="font-mono text-xs text-slate-500 w-24 flex-shrink-0">{inv.invoice_number}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${INV_STATUS_COLORS[effectiveStatus] ?? ""}`}>
                        {t(`invoiceStatus.${effectiveStatus}`, { defaultValue: effectiveStatus })}
                      </span>
                      <span className="flex-1 text-xs text-slate-400">
                        {new Date(inv.issue_date + "T00:00:00").toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums flex-shrink-0">
                        {fmt(Number(inv.total), locale)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estimates */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.estimates.title")}</h2>
              <Link href="/books/estimates/new" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                {t("detail.actions.new")}
              </Link>
            </div>
            {estimates.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">{t("detail.estimates.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {estimates.map((est) => (
                  <Link
                    key={est.id}
                    href={`/books/estimates/${est.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-mono text-xs text-slate-500 w-24 flex-shrink-0">{est.estimate_number}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${EST_STATUS_COLORS[est.status] ?? ""}`}>
                      {t(`estimateStatus.${est.status}`, { defaultValue: est.status })}
                    </span>
                    <span className="flex-1 text-xs text-slate-400">
                      {new Date(est.issue_date + "T00:00:00").toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums flex-shrink-0">
                      {fmt(Number(est.total), locale)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.projects.title")}</h2>
            </div>
            {projects.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">{t("detail.projects.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {projects.map((proj) => (
                  <Link
                    key={proj.id}
                    href={`/projects/${proj.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PROJECT_COLOR_DOTS[proj.color as string] ?? "bg-slate-400"}`} />
                    <span className="flex-1 text-sm text-slate-700 truncate">{proj.name}</span>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{t(`projectStatus.${proj.status}`, { defaultValue: proj.status })}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Open tasks */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.tasks.title")}</h2>
              <Link href="/tasks" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                {t("detail.actions.viewAllTasks")}
              </Link>
            </div>
            {tasks.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">{t("detail.tasks.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {tasks.map((task) => {
                  const overdue = task.due_date && task.due_date < today;
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TASK_PRIORITY_DOTS[task.priority] ?? "bg-slate-300"}`} />
                      <span className="flex-1 text-sm text-slate-700 truncate">{task.title}</span>
                      {task.due_date && (
                        <span className={`text-[11px] flex-shrink-0 ${overdue ? "text-rose-600 font-medium" : "text-slate-400"}`}>
                          {overdue ? t("detail.tasks.overduePrefix") : ""}
                          {new Date(task.due_date + "T00:00:00").toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.messages.title")}</h2>
              <Link href="/inbox" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                {t("detail.actions.openInbox")}
              </Link>
            </div>

            {messages.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">{t("detail.messages.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                      msg.channel === "email" ? "bg-blue-50" : "bg-emerald-50"
                    }`}>
                      {msg.channel === "email"
                        ? <Mail className="w-3 h-3 text-blue-500" />
                        : <MessageSquare className="w-3 h-3 text-emerald-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      {msg.subject && (
                        <p className="text-xs font-medium text-slate-700 truncate">{msg.subject}</p>
                      )}
                      <p className="text-xs text-slate-500 truncate">{msg.body}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">{timeAgo(msg.sent_at, t, locale)}</p>
                      <p className={`text-[10px] ${msg.direction === "inbound" ? "text-indigo-500" : "text-slate-400"}`}>
                        {t(`messageDirection.${msg.direction}`, { defaultValue: msg.direction })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Communication Timeline */}
          <ClientTimelinePanel clientId={client.id} initialLogs={commLogs as Parameters<typeof ClientTimelinePanel>[0]["initialLogs"]} />
        </div>

        {/* Right column — AI brief + notes + edit form */}
        <div className="space-y-4">
          <ClientAIBrief clientId={client.id} initialBrief={aiBrief} />

          {isMedical && (
            <EligibilityPanel
              clientId={client.id}
              insurance={{
                payerId: client.insurance_payer_id ?? "",
                payerName: client.insurance_payer_name ?? "",
                memberId: client.insurance_member_id ?? "",
                dateOfBirth: client.date_of_birth ?? "",
              }}
              latest={latestEligibility}
            />
          )}
          <ClientNotesPanel clientId={client.id} initialNotes={notes} />
          <CommunicationPreferences
            clientId={client.id}
            initialPreferences={commPrefs ? {
              opted_out_sms: commPrefs.opted_out_sms ?? false,
              opted_out_email: commPrefs.opted_out_email ?? false,
              opted_out_calls: commPrefs.opted_out_calls ?? false,
              preferred_contact_method: commPrefs.preferred_contact_method ?? undefined,
              best_time_to_contact: commPrefs.best_time_to_contact ?? undefined,
              notes: commPrefs.notes ?? undefined,
            } : undefined}
          />
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">{t("detail.details")}</h2>
            </div>
            <div className="p-5">
              <ClientEditForm
                clientId={client.id}
                initialValues={{
                  first_name: client.first_name ?? "",
                  last_name: client.last_name ?? "",
                  company: client.company ?? "",
                  email: client.email ?? "",
                  phone: client.phone ?? "",
                  status: client.status,
                  source: client.source ?? "",
                  notes: client.notes ?? "",
                  tags: (client.tags as string[] | null)?.join(", ") ?? "",
                }}
              />
            </div>
          </div>

          {/* Meta */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {t("detail.created", {
                  date: new Date(client.created_at).toLocaleDateString(intlLocale(locale), { month: "long", day: "numeric", year: "numeric" }),
                })}
              </span>
            </div>
            {client.source && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>{t("detail.source", { source: client.source })}</span>
              </div>
            )}
            {(client.tags as string[] | null)?.length ? (
              <div className="flex flex-wrap gap-1 mt-2">
                {(client.tags as string[]).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-600 font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

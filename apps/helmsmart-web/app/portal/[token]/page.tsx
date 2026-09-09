/**
 * Public client portal — /portal/[token]
 *
 * `clients.portal_token` is the capability; nobody signs in. So the reader is
 * the CUSTOMER and the locale is theirs — cookie, then Accept-Language, the
 * way `app/accept/[id]` resolves it — while the money stays in the org's
 * `organizations.currency`, which is what these amounts actually are.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { FileText, CheckCircle2, Clock, AlertCircle, XCircle, Calendar, ChevronRight } from "lucide-react";

/**
 * Colour and icon per status — the LABEL is deliberately not here.
 *
 * A `label: "Overdue"` in a module-scope map is copy that never passes through
 * a `>` and a `<`, so no scan of the JSX can see it, and it renders English on
 * an otherwise translated page. The status is a database enum, so its label is
 * looked up by enum value with every value present in the bundle.
 */
const INV_STATUS: Record<string, { bgColor: string; textColor: string; icon: React.ElementType }> = {
  draft:   { bgColor: "#f1f5f9", textColor: "#64748b", icon: FileText },
  sent:    { bgColor: "#eff6ff", textColor: "#2563eb", icon: Clock },
  paid:    { bgColor: "#f0fdf4", textColor: "#16a34a", icon: CheckCircle2 },
  overdue: { bgColor: "#fff1f2", textColor: "#e11d48", icon: AlertCircle },
  void:    { bgColor: "#f1f5f9", textColor: "#94a3b8", icon: XCircle },
};

const EST_STATUS: Record<string, { bgColor: string; textColor: string }> = {
  draft:    { bgColor: "#f1f5f9", textColor: "#64748b" },
  sent:     { bgColor: "#eff6ff", textColor: "#2563eb" },
  accepted: { bgColor: "#f0fdf4", textColor: "#16a34a" },
  declined: { bgColor: "#fff1f2", textColor: "#e11d48" },
  expired:  { bgColor: "#fffbeb", textColor: "#d97706" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        {title}
      </h2>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function Badge({ label, bgColor, textColor }: { label: string; bgColor: string; textColor: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 100,
      background: bgColor, color: textColor, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [locale, t] = await Promise.all([getServerLocale(), getServerT("public")]);
  const sb = await createServiceClient();

  const { data: client } = await sb
    .from("clients")
    .select("id, first_name, last_name, company, email, organization_id")
    .eq("portal_token", token)
    .single();

  if (!client) notFound();

  const clientName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") ||
    client.company ||
    t("portal.clientFallback");

  const [orgRes, invoicesRes, estimatesRes, eventsRes] = await Promise.all([
    sb.from("organizations").select("name, currency").eq("id", client.organization_id).single(),
    sb.from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, paid_at")
      .eq("client_id", client.id)
      .neq("status", "draft")
      .order("issue_date", { ascending: false }),
    sb.from("estimates")
      .select("id, estimate_number, status, issue_date, expiry_date, total")
      .eq("client_id", client.id)
      .neq("status", "draft")
      .order("issue_date", { ascending: false }),
    sb.from("events")
      .select("id, title, type, start_at, all_day")
      .eq("client_id", client.id)
      .eq("organization_id", client.organization_id)
      .eq("completed", false)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(5),
  ]);

  const orgName   = orgRes.data?.name ?? "HelmSmart";
  const invoices  = invoicesRes.data ?? [];
  const estimates = estimatesRes.data ?? [];
  const events    = eventsRes.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const totalPaid        = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
  const totalOutstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + Number(i.total), 0);
  const openEstimates    = estimates.filter((e) => e.status === "sent");
  const appUrl           = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Built once, called per row — constructing an Intl formatter is the
  // expensive half.
  const fmt = moneyFormatter(locale, orgRes.data?.currency);
  const fmtDate = dateFormatter(locale, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Top bar */}
      <div style={{ background: "#1e1e2e", padding: "0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>H</span>
            </div>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{orgName}</span>
          </div>
          <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>{t("portal.badge")}</span>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 24px 60px" }}>
        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
            {t("portal.greeting", { name: clientName })}
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
            {t("portal.subtitle", { org: orgName })}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px 22px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>{t("portal.kpi.paid")}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#16a34a", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(totalPaid)}</p>
          </div>
          <div style={{ background: totalOutstanding > 0 ? "#fff7f7" : "#fff", border: `1px solid ${totalOutstanding > 0 ? "#fecaca" : "#e2e8f0"}`, borderRadius: 14, padding: "20px 22px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>{t("portal.kpi.outstanding")}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: totalOutstanding > 0 ? "#e11d48" : "#94a3b8", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(totalOutstanding)}</p>
          </div>
        </div>

        {/* Estimates needing action */}
        {openEstimates.length > 0 && (
          <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 14, padding: "16px 20px", marginBottom: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#4338ca", margin: "0 0 12px" }}>
              {t("portal.estimatesWaiting", { count: openEstimates.length })}
            </p>
            {openEstimates.map((est) => (
              <div key={est.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{est.estimate_number}</span>
                  <span style={{ fontSize: 12, color: "#6366f1", marginLeft: 8 }}>{fmt(est.total)}</span>
                </div>
                <a
                  href={`${appUrl}/accept/${est.id}`}
                  style={{
                    padding: "7px 18px", background: "#4f46e5", color: "#fff",
                    borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none",
                  }}
                >
                  {t("portal.review")}
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming appointments */}
        {events.length > 0 && (
          <Section title={t("portal.sections.appointments")}>
            {events.map((evt, i) => {
              const evtDate = new Date(evt.start_at);
              const isToday = evtDate.toISOString().slice(0, 10) === today;
              const dateStr = isToday
                ? t("portal.todayAt", {
                    time: evtDate.toLocaleTimeString(intlLocale(locale), { hour: "numeric", minute: "2-digit" }),
                  })
                : evtDate.toLocaleDateString(intlLocale(locale), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
              const isLast = i === events.length - 1;
              return (
                <div key={evt.id} style={{ padding: "14px 20px", borderBottom: isLast ? "none" : "1px solid #f8fafc", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isToday ? "#f0fdf4" : "#f0f4ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Calendar style={{ width: 16, height: 16, color: isToday ? "#16a34a" : "#6366f1" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evt.title}</p>
                    <p style={{ fontSize: 12, color: isToday ? "#16a34a" : "#94a3b8", margin: "2px 0 0", fontWeight: isToday ? 600 : 400 }}>{dateStr}</p>
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <Section title={t("portal.sections.invoices")}>
            {invoices.map((inv, i) => {
              const effectiveStatus =
                inv.status === "sent" && inv.due_date < today ? "overdue" : inv.status;
              const cfg = INV_STATUS[effectiveStatus] ?? INV_STATUS.sent;
              const statusLabel = t(`portal.invoiceStatus.${effectiveStatus}`, {
                defaultValue: effectiveStatus,
              });
              const StatusIcon = cfg.icon;
              const isLast = i === invoices.length - 1;
              return (
                <div key={inv.id} style={{ padding: "14px 20px", borderBottom: isLast ? "none" : "1px solid #f8fafc", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <StatusIcon style={{ width: 16, height: 16, color: cfg.textColor }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{inv.invoice_number}</span>
                      <Badge label={statusLabel} bgColor={cfg.bgColor} textColor={cfg.textColor} />
                    </div>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
                      {t("portal.due", { date: fmtDate(inv.due_date) })}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.total)}</span>
                    {(effectiveStatus === "sent" || effectiveStatus === "overdue") && (
                      <a
                        href={`${appUrl}/pay/${inv.id}`}
                        style={{ padding: "7px 16px", background: effectiveStatus === "overdue" ? "#e11d48" : "#4f46e5", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                      >
                        {t("portal.payNow")}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* Estimates */}
        {estimates.length > 0 && (
          <Section title={t("portal.sections.estimates")}>
            {estimates.map((est, i) => {
              const today2 = new Date().toISOString().slice(0, 10);
              const effectiveStatus =
                est.status === "sent" && est.expiry_date && est.expiry_date < today2
                  ? "expired"
                  : est.status;
              const cfg = EST_STATUS[effectiveStatus] ?? EST_STATUS.sent;
              const statusLabel = t(`portal.estimateStatus.${effectiveStatus}`, {
                defaultValue: effectiveStatus,
              });
              const isLast = i === estimates.length - 1;
              return (
                <div key={est.id} style={{ padding: "14px 20px", borderBottom: isLast ? "none" : "1px solid #f8fafc", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{est.estimate_number}</span>
                      <Badge label={statusLabel} bgColor={cfg.bgColor} textColor={cfg.textColor} />
                    </div>
                    {/* Two independent labels joined by a separator, not one
                        sentence cut in half — each translates on its own. */}
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
                      {t("portal.issued", { date: fmtDate(est.issue_date) })}
                      {est.expiry_date
                        ? ` · ${t("portal.expires", { date: fmtDate(est.expiry_date) })}`
                        : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{fmt(est.total)}</span>
                    {effectiveStatus === "sent" && (
                      <a
                        href={`${appUrl}/accept/${est.id}`}
                        style={{ padding: "7px 16px", background: "#f8fafc", color: "#4f46e5", border: "1.5px solid #c7d2fe", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                      >
                        {t("portal.review")}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {invoices.length === 0 && estimates.length === 0 && events.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
            <p style={{ fontSize: 14 }}>{t("portal.empty")}</p>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 12, color: "#cbd5e1", marginTop: 40 }}>
          {t("portal.poweredBy")} · {orgName}
        </p>
      </div>
    </div>
  );
}

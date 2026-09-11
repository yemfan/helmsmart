/**
 * Public estimate acceptance portal — /accept/[id]
 * No authentication required; UUID is the capability token.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";
import { calendarDate } from "@/lib/org-date";
import { AcceptButtons } from "./accept-buttons";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

/*
 * The locale is the READER's; the currency is the BUSINESS's. Formatting the
 * reader's locale against a hardcoded USD was half a fix — a Canadian firm's
 * estimate was relabelled as US dollars for every client who opened it, which
 * is worse than an untranslated page because the number reads as true.
 */
function fmt(n: number, locale: string, currency: string) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
  }).format(n);
}

function longDate(ymd: string, locale: string) {
  return new Date(ymd + "T00:00:00").toLocaleDateString(intlLocale(locale), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AcceptEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // This page has no signed-in owner: the locale falls back to the visitor's
  // Accept-Language, which is the closest thing to the reader's own language.
  const [locale, t] = await Promise.all([getServerLocale(), getServerT("auth")]);
  const supabase = await createServiceClient();

  const { data: est } = await supabase
    .from("estimates")
    .select(`
      id, estimate_number, status, issue_date, expiry_date,
      subtotal, tax_rate, tax_amount, total, notes,
      clients(first_name, last_name, company),
      estimate_lines(description, quantity, unit_price, amount, sort_order),
      organizations(name, currency, timezone)
    `)
    .eq("id", id)
    .single();

  if (!est) notFound();

  const clientRaw = est.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
      client.company
    : null;

  const orgRaw = est.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    name: string;
    currency: string | null;
    timezone: string | null;
  } | null;
  // The org's own currency, defaulting to USD only when it has never set one.
  const currency = org?.currency?.trim() || "USD";

  // Expired by the business's date, not the server's — the same day
  // `/api/estimates/[id]/respond` checks when the client clicks Accept.
  const today = calendarDate(org?.timezone);
  const isExpired = est.expiry_date < today;
  const effectiveStatus = isExpired && est.status === "sent" ? "expired" : est.status;

  const lines = (
    Array.isArray(est.estimate_lines) ? est.estimate_lines : []
  ) as {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    sort_order: number;
  }[];
  const sortedLines = [...lines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const isClosed = ["accepted", "declined", "expired"].includes(effectiveStatus);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "40px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 20,
          boxShadow: "0 1px 4px rgba(0,0,0,.08)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ background: "#0f172a", padding: "28px 40px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: -0.5,
                }}
              >
                {est.estimate_number}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                {t("accept.header.from", {
                  name: org?.name ?? t("accept.header.fromFallback"),
                })}
              </div>
              {clientName && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#cbd5e1",
                    marginTop: 2,
                  }}
                >
                  {t("accept.header.for", { name: clientName })}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(Number(est.total), locale, currency)}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                {t("accept.header.validUntil", {
                  date: longDate(est.expiry_date, locale),
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "32px 40px" }}>
          {/* Closed state banners */}
          {effectiveStatus === "accepted" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 28,
              }}
            >
              <CheckCircle2
                style={{ width: 20, height: 20, color: "#16a34a", flexShrink: 0 }}
              />
              <p style={{ margin: 0, fontSize: 14, color: "#15803d" }}>
                {t("accept.status.accepted")}
              </p>
            </div>
          )}

          {effectiveStatus === "declined" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 28,
              }}
            >
              <XCircle
                style={{ width: 20, height: 20, color: "#dc2626", flexShrink: 0 }}
              />
              <p style={{ margin: 0, fontSize: 14, color: "#b91c1c" }}>
                {t("accept.status.declined")}
              </p>
            </div>
          )}

          {effectiveStatus === "expired" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 28,
              }}
            >
              <Clock
                style={{ width: 20, height: 20, color: "#d97706", flexShrink: 0 }}
              />
              <p style={{ margin: 0, fontSize: 14, color: "#b45309" }}>
                {t("accept.status.expired", {
                  date: longDate(est.expiry_date, locale),
                })}
              </p>
            </div>
          )}

          {/* Line items table — scrolls inside itself on a narrow phone */}
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                {(["description", "qty", "price", "amount"] as const).map((h, i) => (
                  <th
                    key={h}
                    style={{
                      paddingBottom: 8,
                      textAlign: i === 0 ? "left" : "right",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t(`accept.table.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((line, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: 14,
                      color: "#334155",
                    }}
                  >
                    {line.description}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: 14,
                      color: "#64748b",
                      textAlign: "right",
                    }}
                  >
                    {Number(line.quantity)}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: 14,
                      color: "#64748b",
                      textAlign: "right",
                    }}
                  >
                    {fmt(Number(line.unit_price), locale, currency)}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                      textAlign: "right",
                    }}
                  >
                    {fmt(Number(line.amount), locale, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Totals */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <div style={{ width: 220 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#64748b",
                  padding: "4px 0",
                }}
              >
                <span>{t("accept.totals.subtotal")}</span>
                <span>{fmt(Number(est.subtotal), locale, currency)}</span>
              </div>
              {Number(est.tax_rate) > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: "#64748b",
                    padding: "4px 0",
                  }}
                >
                  <span>
                    {t("accept.totals.tax", {
                      rate: (Number(est.tax_rate) * 100).toFixed(0),
                    })}
                  </span>
                  <span>{fmt(Number(est.tax_amount), locale, currency)}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0f172a",
                  borderTop: "2px solid #e2e8f0",
                  paddingTop: 12,
                  marginTop: 8,
                }}
              >
                <span>{t("accept.totals.total")}</span>
                <span>{fmt(Number(est.total), locale, currency)}</span>
              </div>
            </div>
          </div>

          {est.notes && (
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: "#334155" }}>{t("accept.notesLabel")}</strong>
                {est.notes}
              </p>
            </div>
          )}

          {/* Accept / Decline buttons */}
          {!isClosed && (
            <AcceptButtons estimateId={est.id} />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            padding: "16px 40px",
            textAlign: "center",
            fontSize: 12,
            color: "#94a3b8",
          }}
        >
          {est.estimate_number} · {t("accept.footer.poweredBy")}
        </div>
      </div>
    </div>
  );
}

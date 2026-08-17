"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

/**
 * Listing-agreement (RLA) upload page — Phase 2B-4.
 *
 * Mirror of /dashboard/offers/upload but for the listing side. Two
 * entry points:
 *
 *   1. Manual: agent picks the seller + drops the executed RLA PDF.
 *      Claude extracts list_price / listing dates / commission.
 *      Agent reviews + saves as a draft listing-rep transaction.
 *
 *   2. Inbound (?inboundId=…): agent clicked "Open in listing upload"
 *      from the /dashboard/inbound/[id] review page. Fields prefill
 *      from the already-stored ListingAgreementExtraction; the
 *      seller-picker behavior depends on whether the inbound
 *      delivery had a sender→contact match the agent confirmed.
 *
 * Save flow: POST /api/dashboard/transactions with
 * `transactionType: "listing_rep"`. The server seeds the listing-side
 * task checklist and returns the transaction id; we redirect to its
 * detail page where the agent picks up the rest of the deal.
 *
 * Why no text-paste path: RLA paste is rare in practice (forms are
 * always PDFs in California / most US markets). PDF-only ships in
 * half the time.
 */

// Mirror of the parse-pdf API's response shape — keep in sync with
// lib/transactions/extractContract.ts so type-checked clients break
// loudly when the contract changes.
type ListingAgreementExtraction = {
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  listingStartDate: string | null;
  listingExpirationDate: string | null;
  sellerNames: string[];
  commissionBuyerSidePct: number | null;
  commissionTotalPct: number | null;
  confidence: number;
  warnings: string[];
};

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

type Translate = (k: string) => string;

function summarize(
  parsed: ListingAgreementExtraction,
  t: Translate,
): { label: string; value: string }[] {
  return [
    { label: t("pages.uploadListing.f.property"), value: parsed.propertyAddress ?? "—" },
    {
      label: t("pages.uploadListing.f.cityStateZip"),
      value: [parsed.city, parsed.state, parsed.zip].filter(Boolean).join(", ") || "—",
    },
    { label: t("pages.uploadListing.f.listPrice"), value: fmtMoney(parsed.listPrice) },
    { label: t("pages.uploadListing.f.listingStart"), value: parsed.listingStartDate ?? "—" },
    { label: t("pages.uploadListing.f.listingExpires"), value: parsed.listingExpirationDate ?? "—" },
    {
      label: t("pages.uploadListing.f.sellers"),
      value: parsed.sellerNames.length ? parsed.sellerNames.join(", ") : "—",
    },
    {
      label: t("pages.uploadListing.f.totalCommission"),
      value:
        parsed.commissionTotalPct != null ? `${parsed.commissionTotalPct}%` : "—",
    },
    {
      label: t("pages.uploadListing.f.buyerCommission"),
      value:
        parsed.commissionBuyerSidePct != null
          ? `${parsed.commissionBuyerSidePct}%`
          : "—",
    },
    {
      label: t("pages.uploadListing.f.confidence"),
      value:
        parsed.confidence != null
          ? `${Math.round(parsed.confidence * 100)}%`
          : "—",
    },
  ];
}

export function UploadListingClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams?.get("contactId") ?? "";
  const inboundId = searchParams?.get("inboundId") ?? null;

  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ListingAgreementExtraction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [inboundSource, setInboundSource] = useState<{
    id: string;
    subject: string | null;
    fromHeader: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Inbound prefill — fetch the delivery and lift the parsed RLA onto
   * review state, skipping the upload step. Same pattern as
   * UploadOfferClient.
   */
  useEffect(() => {
    if (!inboundId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/dashboard/inbound/${inboundId}`);
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          delivery?: {
            id: string;
            subject: string | null;
            from_header: string | null;
            extraction_status: string;
            // Discriminated union — every branch needs a *literal*
            // `kind` so TS can narrow correctly after a kind check.
            // The other extraction kinds are typed loosely because
            // this client only acts on the listing_agreement branch.
            extraction:
              | {
                  kind: "listing_agreement";
                  data: ListingAgreementExtraction;
                }
              | { kind: "offer"; data: Record<string, unknown> }
              | { kind: "showing_request"; data: Record<string, unknown> }
              | null;
          };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.delivery) {
          setError(body.error ?? "Couldn't load forwarded email.");
          return;
        }
        const d = body.delivery;
        setInboundSource({
          id: d.id,
          subject: d.subject,
          fromHeader: d.from_header,
        });
        if (
          d.extraction_status === "extracted" &&
          d.extraction &&
          d.extraction.kind === "listing_agreement"
        ) {
          setParsed(d.extraction.data);
        } else {
          setError(
            d.extraction_status === "failed"
              ? "AI extraction failed for this email — go back and retry from the review page."
              : "This forwarded email doesn't have a parsed RLA yet — open the review page first.",
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inboundId]);

  async function runParsePdf(file: File) {
    setError(null);
    setParsed(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && !file.type.includes("pdf")) {
      setError(t("pages.uploadListing.needPdf"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `That PDF is ${Math.round(file.size / 1024 / 1024)} MB — max 5 MB. Trim to the first 4-6 pages of the RLA.`,
      );
      return;
    }
    setPdfName(file.name);
    setParsing(true);
    try {
      const storagePath = await uploadViaStorage(file, "listing_pdf");
      const res = await fetch("/api/dashboard/listings/parse-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath, fileName: file.name, mime: file.type }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        parsed?: ListingAgreementExtraction;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.parsed) {
        setError(body.error ?? "PDF parse failed.");
        return;
      }
      setParsed(body.parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setParsing(false);
    }
  }

  async function saveAsDraft() {
    if (!parsed) return;
    setError(null);
    if (!contact?.id) {
      setError(t("pages.uploadListing.needSeller"));
      return;
    }
    if (!parsed.propertyAddress) {
      setError(
        "AI couldn't extract a property address. Use New transaction to enter it manually.",
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          propertyAddress: parsed.propertyAddress,
          transactionType: "listing_rep",
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          purchasePrice: parsed.listPrice,
          listingStartDate: parsed.listingStartDate,
          notes:
            parsed.warnings && parsed.warnings.length > 0
              ? `RLA warnings: ${parsed.warnings.join("; ")}`
              : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transaction?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.transaction) {
        setError(body.error ?? "Failed to save listing.");
        return;
      }
      router.push(`/dashboard/transactions/${body.transaction.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  const summary = parsed ? summarize(parsed, t) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/transactions" className="hover:underline">{t("pages.uploadListing.transactions")}</Link>
          {" / Upload listing agreement"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.uploadListing.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.uploadListing.sub")}</p>
      </div>

      {/* Inbound source banner — same pattern as the offer + showing
          uploads. Tells the agent the parsed fields came from a
          forwarded email + back-link to the source. */}
      {inboundSource && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-medium">{t("pages.uploadListing.prefilled")}</div>
          <div className="mt-0.5 text-xs text-emerald-700">
            {inboundSource.subject ? `“${inboundSource.subject}”` : "(no subject)"}
            {inboundSource.fromHeader ? ` · from ${inboundSource.fromHeader}` : ""}
            {" · "}
            <Link
              href={`/dashboard/inbound/${inboundSource.id}`}
              className="underline hover:text-emerald-900"
            >{t("pages.uploadListing.viewSource")}</Link>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.uploadListing.seller")}</label>
          <ContactPicker
            value={contact}
            onChange={setContact}
            initialContactId={prefilledContactId || null}
            helperText="Pick the seller this RLA was signed by."
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.uploadListing.uploadPdf")}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runParsePdf(file);
              e.target.value = "";
            }}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              📄 Choose PDF
            </button>
            {parsing && (
              <span className="text-xs text-slate-500">{t("pages.uploadListing.parsing")}</span>
            )}
            {pdfName && !parsing && (
              <span className="truncate text-xs text-slate-500">{pdfName}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("pages.uploadListing.maxSize")}</p>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </div>

      {summary && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">{t("pages.uploadListing.review")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
            {summary.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {row.label}
                </dt>
                <dd className="text-sm text-slate-800">{row.value}</dd>
              </div>
            ))}
          </dl>

          {parsed && parsed.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="font-medium">{t("pages.uploadListing.warnings")}</div>
              <ul className="mt-1 list-disc pl-4">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveAsDraft()}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? t("pages.uploadListing.saving") : t("pages.uploadListing.save")}
            </button>
            <span className="text-xs text-slate-500">{t("pages.uploadListing.createsNote")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

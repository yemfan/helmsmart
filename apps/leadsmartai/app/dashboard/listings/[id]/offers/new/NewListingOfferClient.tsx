"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ListingDetail } from "@/lib/listings/types";
import type { FinancingType } from "@/lib/offers/types";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Tailwind doesn't generate utilities from concatenated strings, so
 *  this const keeps every input's styling identical without a custom
 *  component. */
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300";

/**
 * Shape mirrors /api/dashboard/offers/parse-pdf's ParsedOffer.
 * Listing-side and buyer-side share the same underlying RPA
 * extraction, so the same Claude prompt's output applies here.
 */
type ParsedOffer = {
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  offerPrice: number | null;
  earnestMoney: number | null;
  downPayment: number | null;
  financingType: FinancingType | null;
  closingDateProposed: string | null;
  offerExpiresAt: string | null;
  inspectionContingency: boolean | null;
  appraisalContingency: boolean | null;
  loanContingency: boolean | null;
  contingencyNotes: string | null;
  notes: string | null;
};

export function NewListingOfferClient({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state — full field set so the seller has everything
  // needed to compare offers.
  const [buyerName, setBuyerName] = useState("");
  const [buyerBrokerage, setBuyerBrokerage] = useState("");
  const [buyerAgentName, setBuyerAgentName] = useState("");
  const [buyerAgentEmail, setBuyerAgentEmail] = useState("");
  const [buyerAgentPhone, setBuyerAgentPhone] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [earnestMoney, setEarnestMoney] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [financingType, setFinancingType] = useState<FinancingType | "">("");
  const [closingDateProposed, setClosingDateProposed] = useState("");
  const [offerExpiresAt, setOfferExpiresAt] = useState("");
  const [inspectionContingency, setInspectionContingency] = useState(true);
  const [appraisalContingency, setAppraisalContingency] = useState(true);
  const [loanContingency, setLoanContingency] = useState(true);
  const [saleOfHomeContingency, setSaleOfHomeContingency] = useState(false);
  const [contingencyNotes, setContingencyNotes] = useState("");
  const [sellerConcessions, setSellerConcessions] = useState("");
  const [buyerCommissionPct, setBuyerCommissionPct] = useState("");
  const [notes, setNotes] = useState("");

  // Upload + parse state.
  const [uploading, setUploading] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Submit state.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Drop a parsed offer onto the form. Conservative `cur ||` checks
   * never clobber a value the agent has already typed — so an agent
   * who pre-fills a few fields, then uploads, doesn't lose work.
   */
  function applyParsed(p: ParsedOffer) {
    if (p.offerPrice != null) setOfferPrice((c) => c || String(p.offerPrice));
    if (p.earnestMoney != null) setEarnestMoney((c) => c || String(p.earnestMoney));
    if (p.downPayment != null) setDownPayment((c) => c || String(p.downPayment));
    if (p.financingType) setFinancingType((c) => c || (p.financingType as FinancingType));
    if (p.closingDateProposed)
      setClosingDateProposed((c) => c || (p.closingDateProposed ?? ""));
    if (p.offerExpiresAt) setOfferExpiresAt((c) => c || (p.offerExpiresAt ?? ""));
    if (p.inspectionContingency != null) setInspectionContingency(p.inspectionContingency);
    if (p.appraisalContingency != null) setAppraisalContingency(p.appraisalContingency);
    if (p.loanContingency != null) setLoanContingency(p.loanContingency);
    if (p.contingencyNotes) setContingencyNotes((c) => c || (p.contingencyNotes ?? ""));
    if (p.notes) setNotes((c) => c || (p.notes ?? ""));
    const summary = [
      p.offerPrice != null ? `$${p.offerPrice.toLocaleString()}` : null,
      p.financingType ?? null,
      p.closingDateProposed ?? null,
    ]
      .filter(Boolean)
      .join(" · ");
    setParsedSummary(`Prefilled from PDF${summary ? ` — ${summary}` : ""}.`);
  }

  async function handleFile(file: File) {
    setUploadError(null);
    setParsedSummary(null);
    if (file.size > MAX_PDF_BYTES) {
      setUploadError("File is larger than 5MB.");
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setUploadError("Only PDF uploads are supported.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dashboard/offers/parse-pdf", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        parsed?: ParsedOffer;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.parsed) {
        setUploadError(body.error ?? "Couldn't extract details from this PDF.");
        return;
      }
      applyParsed(body.parsed);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSubmitError(null);
    const priceNum = Number(offerPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setSubmitError("Offer price is required and must be a positive number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/dashboard/listings/${encodeURIComponent(listing.id)}/offers`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            offerPrice: priceNum,
            buyerName: buyerName.trim() || null,
            buyerBrokerage: buyerBrokerage.trim() || null,
            buyerAgentName: buyerAgentName.trim() || null,
            buyerAgentEmail: buyerAgentEmail.trim() || null,
            buyerAgentPhone: buyerAgentPhone.trim() || null,
            earnestMoney: earnestMoney ? Number(earnestMoney) : null,
            downPayment: downPayment ? Number(downPayment) : null,
            financingType: financingType || null,
            closingDateProposed: closingDateProposed || null,
            offerExpiresAt: offerExpiresAt
              ? new Date(offerExpiresAt).toISOString()
              : null,
            inspectionContingency,
            appraisalContingency,
            loanContingency,
            saleOfHomeContingency,
            contingencyNotes: contingencyNotes.trim() || null,
            sellerConcessions: sellerConcessions ? Number(sellerConcessions) : null,
            buyerCommissionPct: buyerCommissionPct ? Number(buyerCommissionPct) : null,
            notes: notes.trim() || null,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setSubmitError(body.error ?? "Failed to record offer.");
        return;
      }
      router.push(`/dashboard/listings/${encodeURIComponent(listing.id)}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div>
        <div className="text-xs text-slate-500">
          <Link
            href={`/dashboard/listings/${encodeURIComponent(listing.id)}`}
            className="hover:underline"
          >
            {listing.property_address}
          </Link>
          {" / Record offer"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{t("pages.newListingOffer.recordOffer")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.newListingOffer.recordOfferSub")}</p>
      </div>

      {/* Upload section — drop a signed RPA PDF and Claude extracts
          most of the fields below. Conservative prefill so any value
          the agent already typed survives. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (uploading) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => {
          if (!uploading) fileInputRef.current?.click();
        }}
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-dashed px-4 py-4 text-sm transition-colors ${
          dragActive
            ? "border-slate-700 bg-slate-50"
            : uploading
              ? "border-slate-300 bg-slate-50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <div className="min-w-0">
          <div className="font-medium text-slate-800">
            {uploading
              ? t("pages.newListingOffer.readingOfferPdf")
              : parsedSummary
                ? "✓ Prefilled from PDF"
                : t("pages.newListingOffer.uploadOfferPdfOptional")}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {uploading
              ? "15-40 seconds for most purchase agreements."
              : parsedSummary
                ? parsedSummary
                : t("pages.newListingOffer.dropASignedRpa")}
          </div>
        </div>
        <div className="shrink-0 text-2xl" aria-hidden>
          {uploading ? "⏳" : parsedSummary ? "✅" : "📄"}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // Reset so re-picking the same file fires onChange again.
          if (e.target) e.target.value = "";
        }}
      />
      {uploadError ? (
        <p className="-mt-3 text-xs text-rose-600">{uploadError}</p>
      ) : null}

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* ── Buyer ───────────────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.newListingOffer.buyer")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("pages.newListingOffer.buyerName")}>
              <input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder={t("pages.newListingOffer.buyerNamePlaceholder")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.buyerBrokerage")}>
              <input
                value={buyerBrokerage}
                onChange={(e) => setBuyerBrokerage(e.target.value)}
                placeholder={t("pages.newListingOffer.brokeragePlaceholder")}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("pages.newListingOffer.buyerAgent")}>
              <input
                value={buyerAgentName}
                onChange={(e) => setBuyerAgentName(e.target.value)}
                placeholder={t("pages.newListingOffer.agentName")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.agentEmail")}>
              <input
                type="email"
                value={buyerAgentEmail}
                onChange={(e) => setBuyerAgentEmail(e.target.value)}
                placeholder={t("pages.newListingOffer.agentEmailPlaceholder")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.agentPhone")}>
              <input
                type="tel"
                value={buyerAgentPhone}
                onChange={(e) => setBuyerAgentPhone(e.target.value)}
                placeholder="(626) 555-1234"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </fieldset>

        {/* ── Price + financing ───────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.newListingOffer.priceFinancing")}</legend>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("pages.newListingOffer.offerPrice")}>
              <input
                type="number"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.earnestMoney")}>
              <input
                type="number"
                value={earnestMoney}
                onChange={(e) => setEarnestMoney(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.downPayment")}>
              <input
                type="number"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("pages.newListingOffer.financing")}>
              <select
                value={financingType}
                onChange={(e) =>
                  setFinancingType(e.target.value as FinancingType | "")
                }
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                <option value="cash">{t("pages.newListingOffer.cash")}</option>
                <option value="conventional">{t("pages.newListingOffer.conventional")}</option>
                <option value="fha">{t("pages.newListingOffer.fha")}</option>
                <option value="va">VA</option>
                <option value="jumbo">{t("pages.newListingOffer.jumbo")}</option>
                <option value="other">{t("pages.newListingOffer.other")}</option>
              </select>
            </Field>
            <Field
              label={t("pages.newListingOffer.concessions")}
              hint="Buyer-requested credit at closing"
            >
              <input
                type="number"
                value={sellerConcessions}
                onChange={(e) => setSellerConcessions(e.target.value)}
                placeholder="0"
                className={INPUT_CLASS}
              />
            </Field>
            <Field
              label={t("pages.newListingOffer.buyerCommission")}
              hint="Offered to buyer's brokerage"
            >
              <input
                type="number"
                step="0.1"
                value={buyerCommissionPct}
                onChange={(e) => setBuyerCommissionPct(e.target.value)}
                placeholder="2.5"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </fieldset>

        {/* ── Timing ──────────────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.newListingOffer.timing")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("pages.newListingOffer.proposedClosing")}>
              <input
                type="date"
                value={closingDateProposed}
                onChange={(e) => setClosingDateProposed(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("pages.newListingOffer.offerExpires")}>
              <input
                type="datetime-local"
                value={offerExpiresAt}
                onChange={(e) => setOfferExpiresAt(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </fieldset>

        {/* ── Contingencies ───────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.newListingOffer.contingencies")}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={inspectionContingency}
                onChange={(e) => setInspectionContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newListingOffer.inspection")}</label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={appraisalContingency}
                onChange={(e) => setAppraisalContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newListingOffer.appraisal")}</label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={loanContingency}
                onChange={(e) => setLoanContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newListingOffer.loan")}</label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={saleOfHomeContingency}
                onChange={(e) => setSaleOfHomeContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newListingOffer.saleOfHome")}</label>
          </div>
          <Field label={t("pages.newListingOffer.otherContingencies")}>
            <input
              value={contingencyNotes}
              onChange={(e) => setContingencyNotes(e.target.value)}
              placeholder={t("pages.newListingOffer.otherPlaceholder")}
              className={INPUT_CLASS}
            />
          </Field>
        </fieldset>

        {/* ── Notes ───────────────────────────────────────────── */}
        <Field label={t("pages.newListingOffer.notes")}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("pages.newListingOffer.notesPlaceholder")}
            className={INPUT_CLASS}
          />
        </Field>

        {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href={`/dashboard/listings/${encodeURIComponent(listing.id)}`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >{t("pages.newListingOffer.cancel")}</Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !offerPrice}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? t("pages.newListingOffer.recording") : t("pages.newListingOffer.record")}
          </button>
        </div>
      </div>

    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

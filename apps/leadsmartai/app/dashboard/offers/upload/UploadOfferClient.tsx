"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";
import type { FinancingType } from "@/lib/offers/types";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

/**
 * Mirror of the parse API's response shape — keep in sync with
 * apps/leadsmartai/app/api/dashboard/offers/parse/route.ts so type-
 * checked clients break loudly when the contract changes.
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

const MAX_INPUT_CHARS = 60_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function formatMoneyOrDash(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

type Translate = (k: string) => string;

function summarize(parsed: ParsedOffer, t: Translate): { label: string; value: string }[] {
  return [
    { label: t("pages.uploadOffer.f.property"), value: parsed.propertyAddress ?? "—" },
    { label: t("pages.uploadOffer.f.cityStateZip"), value: [parsed.city, parsed.state, parsed.zip].filter(Boolean).join(", ") || "—" },
    { label: t("pages.uploadOffer.f.listPrice"), value: formatMoneyOrDash(parsed.listPrice) },
    { label: t("pages.uploadOffer.f.offerPrice"), value: formatMoneyOrDash(parsed.offerPrice) },
    { label: t("pages.uploadOffer.f.earnestMoney"), value: formatMoneyOrDash(parsed.earnestMoney) },
    { label: t("pages.uploadOffer.f.downPayment"), value: formatMoneyOrDash(parsed.downPayment) },
    { label: t("pages.uploadOffer.f.financing"), value: parsed.financingType ?? "—" },
    { label: t("pages.uploadOffer.f.proposedClosing"), value: parsed.closingDateProposed ?? "—" },
    { label: t("pages.uploadOffer.f.offerExpires"), value: parsed.offerExpiresAt ?? "—" },
    {
      label: t("pages.uploadOffer.f.inspection"),
      value:
        parsed.inspectionContingency == null
          ? "—"
          : parsed.inspectionContingency
            ? "WAIVED"
            : "kept",
    },
    {
      label: t("pages.uploadOffer.f.appraisal"),
      value:
        parsed.appraisalContingency == null
          ? "—"
          : parsed.appraisalContingency
            ? "WAIVED"
            : "kept",
    },
    {
      label: t("pages.uploadOffer.f.loan"),
      value:
        parsed.loanContingency == null
          ? "—"
          : parsed.loanContingency
            ? "WAIVED"
            : "kept",
    },
    { label: t("pages.uploadOffer.f.otherContingencies"), value: parsed.contingencyNotes ?? "—" },
    { label: t("pages.uploadOffer.f.notes"), value: parsed.notes ?? "—" },
  ];
}

export function UploadOfferClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams?.get("contactId") ?? "";
  const inboundId = searchParams?.get("inboundId") ?? null;

  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedOffer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Name of the PDF the agent picked, for display only. */
  const [pdfName, setPdfName] = useState<string | null>(null);
  /** Banner shown when prefill came from a forwarded email. */
  const [inboundSource, setInboundSource] = useState<{
    id: string;
    subject: string | null;
    fromHeader: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Prefill from a forwarded-email delivery. Triggered by the
   * /dashboard/inbound/[id] page when the agent clicks "Open in offer
   * upload". We fetch the delivery row, lift its already-extracted
   * ParsedOffer onto the review state, and skip the parse step
   * entirely — the agent only needs to pick the buyer and save.
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
            extraction: { kind: "offer"; data: ParsedOffer } | null;
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
          d.extraction.kind === "offer"
        ) {
          setParsed(d.extraction.data);
        } else {
          setError(
            d.extraction_status === "failed"
              ? "AI extraction failed for this email — go back and retry from the review page."
              : "This forwarded email doesn't have a parsed offer yet — open the review page first.",
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

  /**
   * Step 1 (PDF path) → uploads the file to /parse-pdf which runs
   * Claude on the document directly. Returns the same ParsedOffer
   * shape as the text-paste flow so the review UI is identical.
   */
  async function runParsePdf(file: File) {
    setError(null);
    setParsed(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && !file.type.includes("pdf")) {
      setError(t("pages.uploadOffer.needPdf"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`That PDF is ${Math.round(file.size / 1024 / 1024)} MB — max 5 MB. Trim to the offer + contingency pages.`);
      return;
    }
    setPdfName(file.name);
    setParsing(true);
    try {
      const storagePath = await uploadViaStorage(file, "offer_pdf");
      const res = await fetch("/api/dashboard/offers/parse-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath, fileName: file.name, mime: file.type }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        parsed?: ParsedOffer;
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

  // Step 1 (text path) → AI parse only (no save). Agent reviews + saves below.
  async function runParse() {
    setError(null);
    setParsed(null);
    if (!text.trim()) {
      setError(t("pages.uploadOffer.needText"));
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      setError(`That's ${text.length.toLocaleString()} characters — trim to ~${MAX_INPUT_CHARS.toLocaleString()} or less (offer + contingency pages, no boilerplate).`);
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/dashboard/offers/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        parsed?: ParsedOffer;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.parsed) {
        setError(body.error ?? "Parse failed.");
        return;
      }
      setParsed(body.parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setParsing(false);
    }
  }

  // Step 2 → save the parsed offer as a draft. Re-uses the existing
  // /api/dashboard/offers POST so we don't duplicate validation.
  async function saveAsDraft() {
    if (!parsed) return;
    setError(null);
    if (!contact?.id) {
      setError(t("pages.uploadOffer.needBuyer"));
      return;
    }
    if (!parsed.propertyAddress) {
      setError(t("pages.uploadOffer.noAddress"));
      return;
    }
    if (parsed.offerPrice == null || parsed.offerPrice <= 0) {
      setError(t("pages.uploadOffer.noPrice"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          propertyAddress: parsed.propertyAddress,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          listPrice: parsed.listPrice,
          offerPrice: parsed.offerPrice,
          earnestMoney: parsed.earnestMoney,
          downPayment: parsed.downPayment,
          financingType: parsed.financingType,
          closingDateProposed: parsed.closingDateProposed,
          offerExpiresAt: parsed.offerExpiresAt,
          // null → fall back to the form defaults (true / true / true).
          inspectionContingency: parsed.inspectionContingency == null ? true : !parsed.inspectionContingency,
          appraisalContingency: parsed.appraisalContingency == null ? true : !parsed.appraisalContingency,
          loanContingency: parsed.loanContingency == null ? true : !parsed.loanContingency,
          contingencyNotes: parsed.contingencyNotes,
          notes: parsed.notes,
          submitNow: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        offer?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.offer) {
        setError(body.error ?? "Failed to save offer.");
        return;
      }
      router.push(`/dashboard/offers/${body.offer.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/offers" className="hover:underline">{t("pages.uploadOffer.offers")}</Link>
          {" / Upload"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.uploadOffer.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.uploadOffer.blurb")}</p>
      </div>

      {/* Banner shown when prefill arrived from a forwarded email.
          Lets the agent know the parsed fields below came from the
          inbound pipeline (not their own paste/upload), and gives
          them a back-link to the review page if they want to compare
          against the source email. */}
      {inboundSource && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-medium">{t("pages.uploadOffer.prefilled")}</div>
          <div className="mt-0.5 text-xs text-emerald-700">
            {inboundSource.subject ? `“${inboundSource.subject}”` : "(no subject)"}
            {inboundSource.fromHeader ? ` · from ${inboundSource.fromHeader}` : ""}
            {" · "}
            <Link
              href={`/dashboard/inbound/${inboundSource.id}`}
              className="underline hover:text-emerald-900"
            >{t("pages.uploadOffer.viewSource")}</Link>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.uploadOffer.buyer")}</label>
          <ContactPicker
            value={contact}
            onChange={setContact}
            initialContactId={prefilledContactId || null}
            helperText="Pick the buyer this offer is from."
            className="mt-1"
          />
        </div>

        {/* PDF upload — primary path. Drops the agent into the same
            review screen as the text-paste flow once Claude returns
            its extraction. Hidden text input + button so the styling
            matches the rest of the form (raw <input type="file"> is
            ugly across browsers). */}
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.uploadOffer.uploadPdf")}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runParsePdf(file);
              // Reset the input so picking the same file twice still re-fires onChange.
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
              {t("pages.uploadOffer.choosePdf")}
            </button>
            <span className="text-[11px] text-slate-500">
              {pdfName ? (
                <>{t("pages.uploadOffer.selected")}<strong className="font-medium text-slate-700">{pdfName}</strong>
                </>
              ) : (
                <>{t("pages.uploadOffer.maxSize")}</>
              )}
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" aria-hidden />
          <span className="relative inline-block bg-white px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Or
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.uploadOffer.pasteText")}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={`Paste the full offer text here.

Tip: if you don't have a PDF, open the document, Cmd+A to select all, Cmd+C to copy, then paste into this box. Bullet points and page breaks are fine.`}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t("pages.uploadOffer.charCount", { used: text.length.toLocaleString(), max: MAX_INPUT_CHARS.toLocaleString() })}
          </p>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href="/dashboard/offers"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >{t("pages.uploadOffer.cancel")}</Link>
          <button
            type="button"
            onClick={() => void runParse()}
            disabled={parsing || !text.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {parsing ? t("common:status.parsing") : parsed ? t("pages.uploadOffer.reparse") : t("pages.uploadOffer.parse")}
          </button>
        </div>
      </div>

      {parsed ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.uploadOffer.extracted")}</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {t("pages.uploadOffer.extractedHelp")}
            </p>
          </div>

          <dl className="divide-y divide-slate-100 text-sm">
            {summarize(parsed, t).map((row) => (
              <div key={row.label} className="grid grid-cols-3 gap-3 py-1.5">
                <dt className="col-span-1 text-slate-500">{row.label}</dt>
                <dd className="col-span-2 text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => void saveAsDraft()}
              disabled={saving || !contact?.id || !parsed.propertyAddress || parsed.offerPrice == null}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t("pages.uploadOffer.saving") : t("pages.uploadOffer.save")}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {t("pages.uploadOffer.draftBefore")} <strong>{t("pages.uploadOffer.draftWord")}</strong>{t("pages.uploadOffer.draftAfter")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

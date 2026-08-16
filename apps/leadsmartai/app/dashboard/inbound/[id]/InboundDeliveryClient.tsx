"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type {
  InboundDeliveryWithMatch,
  InboundExtractionPayload,
} from "@/lib/inbound/deliveries";

/**
 * Review surface for one inbound (forwarded) email.
 *
 * This is the page the agent lands on when they click the link in the
 * "Review forwarded …" task. Three regions:
 *   1. Envelope — sender / subject / attachments / raw body preview
 *      so the agent can confirm the right email was routed.
 *   2. Extraction — the AI-parsed structured fields (offer or RLA).
 *      When extraction is missing or failed, this region shows a
 *      "Run / retry extraction" button instead.
 *   3. Apply — CTA to push the parsed fields into the existing offer
 *      or listing upload flow, where the agent picks a contact and
 *      saves the draft. We don't auto-create drafts here because
 *      contact matching is a real judgment call — the wrong choice
 *      poisons the CRM.
 */
export default function InboundDeliveryClient({
  delivery,
  intentLabel,
}: {
  delivery: InboundDeliveryWithMatch;
  intentLabel: string;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [current, setCurrent] = useState<InboundDeliveryWithMatch>(delivery);
  // Buyer/seller selection state. Defaults to "use match" when the
  // webhook found one — the agent can untoggle to "different person"
  // if the from-header was a TC or assistant rather than the actual
  // party. Persists for the page session only; not written back.
  const [useSuggestedContact, setUseSuggestedContact] = useState<boolean>(
    delivery.matched_contact != null,
  );
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function runExtraction() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/dashboard/inbound/${current.id}/extract`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        delivery?: InboundDeliveryWithMatch;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.delivery) {
        setRetryError(body.error ?? "Retry failed");
        return;
      }
      setCurrent(body.delivery);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRetrying(false);
    }
  }

  const attachments = current.attachments_json ?? [];
  const pdfCount = attachments.filter(
    (a) =>
      (a.content_type ?? "").toLowerCase().includes("pdf") ||
      (a.filename ?? "").toLowerCase().endsWith(".pdf"),
  ).length;

  // Build the apply-draft link with the suggested contact prefilled
  // when the agent has agreed to use it. "Different person" toggle
  // strips the contactId so they pick from scratch on the upload page.
  const applyHref = applyDraftHref(
    current,
    useSuggestedContact ? current.matched_contact?.id ?? null : null,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/calendar" className="hover:underline">
            {t("pages.inbound.breadcrumbCalendar")}
          </Link>
          {t("pages.inbound.breadcrumbForwarded")}
          <span className="text-slate-700">{intentLabel}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {current.subject ?? t("pages.inbound.noSubject")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("pages.inbound.forwardedAt", {
            when: new Date(current.created_at).toLocaleString(locale),
          })}{" "}
          <span className="font-medium text-slate-700">{intentLabel}</span>
        </p>
      </div>

      {/* ── Envelope ─────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("pages.inbound.email")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
          <Field label={t("pages.inbound.from")} value={current.from_header} />
          <Field label="To" value={current.to_header} />
          <Field label={t("pages.inbound.subject")} value={current.subject} />
          <Field
            label={t("pages.inbound.attachments")}
            value={
              attachments.length === 0
                ? "(none)"
                : `${attachments.length} (${pdfCount} PDF)`
            }
          />
        </dl>
        {current.text_preview && (
          <details className="group">
            <summary className="cursor-pointer select-none text-xs font-medium text-slate-600 hover:text-slate-900">{t("pages.inboundDelivery.showBody")}</summary>
            <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              {current.text_preview}
            </pre>
          </details>
        )}
      </section>

      {/* ── Extraction ───────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t("pages.inboundDelivery.aiExtraction")}</h2>
          <ExtractionStatusPill status={current.extraction_status} />
        </div>

        {current.extraction_status === "extracted" && current.extraction ? (
          <ExtractionView extraction={current.extraction} />
        ) : current.extraction_status === "skipped" ? (
          <p className="text-sm text-slate-500">{t("pages.inboundDelivery.noExtractor")}</p>
        ) : current.extraction_status === "failed" ? (
          <div className="space-y-2">
            <p className="text-sm text-rose-700">
              {current.extraction_error ?? "Extraction failed."}
            </p>
            <button
              type="button"
              onClick={runExtraction}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {retrying ? t("pages.inbound.retrying") : t("pages.inbound.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">{t("pages.inboundDelivery.notRunYet")}</p>
            <button
              type="button"
              onClick={runExtraction}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {retrying ? t("pages.inbound.running") : t("pages.inbound.run")}
            </button>
          </div>
        )}

        {retryError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {retryError}
          </p>
        )}
      </section>

      {/* ── Suggested contact (Phase 2B-1) ──────────────────────────
          Shown when the webhook found a CRM contact whose email
          matches the `from` header. Agent picks "Use" to preselect
          the buyer on the upload page, or "Different person" to fall
          through to a manual pick. Hidden entirely when there's no
          match — they'll just pick manually as before. */}
      {current.matched_contact && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-blue-900">{t("pages.inboundDelivery.suggestedContact")}</h2>
          <p className="mt-1 text-sm text-blue-900">
            {t("pages.inboundDelivery.looksLike")}{" "}
            <span className="font-semibold">
              {current.matched_contact.name ?? current.matched_contact.email ?? "—"}
            </span>
            {current.matched_contact.email && current.matched_contact.name ? (
              <>
                {" "}
                <span className="font-mono text-xs text-blue-700">
                  &lt;{current.matched_contact.email}&gt;
                </span>
              </>
            ) : null}{" "}
            {t("pages.inboundDelivery.fromYourCrm")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setUseSuggestedContact(true)}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                useSuggestedContact
                  ? "bg-blue-600 text-white"
                  : "bg-white text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
              }`}
            >{t("pages.inboundDelivery.useThisContact")}</button>
            <button
              type="button"
              onClick={() => setUseSuggestedContact(false)}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                !useSuggestedContact
                  ? "bg-slate-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >{t("pages.inboundDelivery.differentPerson")}</button>
            <Link
              href={`/dashboard/contacts/${current.matched_contact.id}`}
              className="ml-auto text-blue-700 hover:underline"
            >
              View contact →
            </Link>
          </div>
        </section>
      )}

      {/* ── Apply CTA ────────────────────────────────────────────── */}
      {current.extraction_status === "extracted" && applyHref && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-900">{t("pages.inboundDelivery.saveDraft")}</h2>
          <p className="mt-1 text-sm text-emerald-800">
            {t("pages.inboundDelivery.prefilled")}{" "}
            {useSuggestedContact && current.matched_contact ? (
              <>
                {t("pages.inboundDelivery.buyerIsSetTo")}{" "}
                <span className="font-semibold">
                  {current.matched_contact.name ?? current.matched_contact.email}
                </span>
                .
              </>
            ) : (
              <>{t("pages.inbound.pickParty")}</>
            )}
          </p>
          <Link
            href={applyHref}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            {applyCtaLabel(current, t)}
          </Link>
        </section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-800">{value ?? "—"}</dd>
    </>
  );
}

function ExtractionStatusPill({ status }: { status: string }) {
  const cls =
    status === "extracted"
      ? "bg-emerald-100 text-emerald-800"
      : status === "failed"
        ? "bg-rose-100 text-rose-800"
        : status === "skipped"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ExtractionView({
  extraction,
}: {
  extraction: InboundExtractionPayload;
}) {
  const { t } = useTranslation("dashboard");
  if (extraction.kind === "offer") {
    const o = extraction.data;
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
        <Field label={t("pages.uploadOffer.f.property")} value={o.propertyAddress} />
        <Field
          label={t("pages.uploadOffer.f.cityStateZip")}
          value={[o.city, o.state, o.zip].filter(Boolean).join(", ") || null}
        />
        <Field label={t("pages.uploadOffer.f.listPrice")} value={fmtMoney(o.listPrice)} />
        <Field label={t("pages.uploadOffer.f.offerPrice")} value={fmtMoney(o.offerPrice)} />
        <Field label={t("pages.uploadOffer.f.earnestMoney")} value={fmtMoney(o.earnestMoney)} />
        <Field label={t("pages.uploadOffer.f.downPayment")} value={fmtMoney(o.downPayment)} />
        <Field label={t("pages.uploadOffer.f.financing")} value={o.financingType} />
        <Field label={t("pages.uploadOffer.f.proposedClosing")} value={o.closingDateProposed} />
        <Field label={t("pages.uploadOffer.f.offerExpires")} value={o.offerExpiresAt} />
        <Field
          label={t("pages.uploadOffer.f.inspection")}
          value={contingencyLabel(o.inspectionContingency, t)}
        />
        <Field
          label={t("pages.uploadOffer.f.appraisal")}
          value={contingencyLabel(o.appraisalContingency, t)}
        />
        <Field
          label={t("pages.uploadOffer.f.loan")}
          value={contingencyLabel(o.loanContingency, t)}
        />
        <Field label={t("pages.uploadOffer.f.otherContingencies")} value={o.contingencyNotes} />
        <Field label={t("pages.inbound.f.notes")} value={o.notes} />
      </dl>
    );
  }

  if (extraction.kind === "listing_agreement") {
    const l = extraction.data;
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
        <Field label={t("pages.uploadOffer.f.property")} value={l.propertyAddress} />
        <Field
          label={t("pages.uploadOffer.f.cityStateZip")}
          value={[l.city, l.state, l.zip].filter(Boolean).join(", ") || null}
        />
        <Field label={t("pages.uploadOffer.f.listPrice")} value={fmtMoney(l.listPrice)} />
        <Field label={t("pages.uploadListing.f.listingStart")} value={l.listingStartDate} />
        <Field label={t("pages.uploadListing.f.listingExpires")} value={l.listingExpirationDate} />
        <Field
          label={t("pages.uploadListing.f.sellers")}
          value={l.sellerNames.length > 0 ? l.sellerNames.join(", ") : null}
        />
        <Field
          label={t("pages.uploadListing.f.totalCommission")}
          value={l.commissionTotalPct != null ? `${l.commissionTotalPct}%` : null}
        />
        <Field
          label={t("pages.uploadListing.f.buyerCommission")}
          value={
            l.commissionBuyerSidePct != null
              ? `${l.commissionBuyerSidePct}%`
              : null
          }
        />
        <Field
          label={t("pages.inbound.f.confidence")}
          value={l.confidence != null ? `${Math.round(l.confidence * 100)}%` : null}
        />
        {l.warnings.length > 0 && (
          <Field label={t("pages.inbound.f.warnings")} value={l.warnings.join("; ")} />
        )}
      </dl>
    );
  }

  // showing_request (Phase 2B-2)
  const s = extraction.data;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
      <Field label={t("pages.inbound.f.requester")} value={s.requesterName} />
      <Field label={t("pages.inbound.f.phone")} value={s.requesterPhone} />
      <Field label={t("pages.labels.emailAddress")} value={s.requesterEmail} />
      <Field label={t("pages.uploadOffer.f.property")} value={s.propertyAddress} />
      <Field
        label={t("pages.uploadOffer.f.cityStateZip")}
        value={[s.city, s.state, s.zip].filter(Boolean).join(", ") || null}
      />
      <Field label={t("pages.inbound.f.requestedDate")} value={s.requestedDate} />
      <Field label={t("pages.inbound.f.requestedTime")} value={s.requestedTime} />
      <Field label={t("pages.inbound.f.notes")} value={s.notes} />
      <Field
        label={t("pages.inbound.f.confidence")}
        value={s.confidence != null ? `${Math.round(s.confidence * 100)}%` : null}
      />
      {s.warnings.length > 0 && (
        <Field label={t("pages.inbound.f.warnings")} value={s.warnings.join("; ")} />
      )}
    </dl>
  );
}

function fmtMoney(n: number | null): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function contingencyLabel(v: boolean | null, t: (k: string) => string): string | null {
  if (v == null) return null;
  return v ? t("pages.inbound.waived") : t("pages.inbound.kept");
}

type Translate = (k: string) => string;

function applyCtaLabel(d: InboundDeliveryWithMatch, t: Translate): string {
  if (d.intent === "offer_received") return t("pages.inbound.openOfferUpload");
  if (d.intent === "listing_signed") return t("pages.inbound.openListingUpload");
  if (d.intent === "showing_requested") return t("pages.inbound.openShowingForm");
  return t("pages.inbound.openUpload");
}

/**
 * Build the upload-page URL for the "Save as a draft" CTA. The upload
 * pages will fetch /api/dashboard/inbound/[id] themselves to pick up
 * the parsed fields — keeps the URL short instead of base64-encoding
 * the whole extraction.
 *
 * `contactId` (Phase 2B-1) preselects the buyer/seller in the upload
 * page's contact picker when the agent confirmed the suggested
 * match. Null when they hit "Different person" or there was no
 * match — picker stays empty for them to choose manually.
 */
function applyDraftHref(
  d: InboundDeliveryWithMatch,
  contactId: string | null,
): string | null {
  if (d.intent === "offer_received") {
    const params = new URLSearchParams({ inboundId: d.id });
    if (contactId) params.set("contactId", contactId);
    return `/dashboard/offers/upload?${params.toString()}`;
  }
  if (d.intent === "showing_requested") {
    // /dashboard/showings/new fetches the delivery on mount and
    // prefills address / date / time / notes from the extraction.
    // contactId preselects the buyer when the matched-contact toggle
    // is "Use this contact" — otherwise the form's Contact Picker
    // stays open for manual selection (most likely case for
    // showings, since the requester is often a NEW lead).
    const params = new URLSearchParams({ inboundId: d.id });
    if (contactId) params.set("contactId", contactId);
    return `/dashboard/showings/new?${params.toString()}`;
  }
  if (d.intent === "listing_signed") {
    // Phase 2B-4: /dashboard/listings/upload mirrors the offer upload
    // — fetches the delivery, prefills with the parsed RLA fields,
    // agent picks the seller and saves as a listing-rep transaction.
    const params = new URLSearchParams({ inboundId: d.id });
    if (contactId) params.set("contactId", contactId);
    return `/dashboard/listings/upload?${params.toString()}`;
  }
  return null;
}

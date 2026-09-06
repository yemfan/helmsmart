"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type {
  OverallReaction,
  ShowingFeedbackRow,
  ShowingListItem,
  ShowingRow,
  ShowingStatus,
} from "@/lib/showings/types";

const STATUS_LABEL: Record<ShowingStatus, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  cancelled: "Cancelled",
  no_show: "No show",
};

const STATUS_BADGE: Record<ShowingStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  attended: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-amber-100 text-amber-800",
};

const REACTION_LABEL: Record<OverallReaction, { emoji: string; labelKey: string; tone: string }> = {
  love: { emoji: "❤️", labelKey: "pages.showingDetail.reaction.love", tone: "bg-red-50 border-red-200 text-red-700" },
  like: { emoji: "👍", labelKey: "pages.showingDetail.reaction.like", tone: "bg-green-50 border-green-200 text-green-700" },
  maybe: { emoji: "🤔", labelKey: "pages.showingDetail.reaction.maybe", tone: "bg-amber-50 border-amber-200 text-amber-700" },
  pass: { emoji: "👎", labelKey: "pages.showingDetail.reaction.pass", tone: "bg-slate-50 border-slate-200 text-slate-700" },
};

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ShowingDetailClient({
  showing,
  feedback: initialFeedback,
  contactName,
  siblings,
}: {
  showing: ShowingRow;
  feedback: ShowingFeedbackRow | null;
  contactName: string | null;
  siblings: ShowingListItem[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const confirmDialog = useConfirm();
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [status, setStatus] = useState<ShowingStatus>(showing.status);
  const [feedback, setFeedback] = useState<ShowingFeedbackRow | null>(initialFeedback);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function saveStatus(next: ShowingStatus) {
    setStatus(next);
    setSavingStatus(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/showings/${showing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save status." });
        setStatus(showing.status);
        return;
      }
      setMsg({ tone: "ok", text: t("pages.showingDetail.statusSaved") });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
      setStatus(showing.status);
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveFeedback(patch: Partial<ShowingFeedbackRow>) {
    const next = { ...(feedback ?? ({} as ShowingFeedbackRow)), ...patch };
    setFeedback(next as ShowingFeedbackRow);
    setSavingFeedback(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/showings/${showing.id}/feedback`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        feedback?: ShowingFeedbackRow;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save feedback." });
        return;
      }
      if (body.feedback) setFeedback(body.feedback);
      setMsg({ tone: "ok", text: t("pages.showingDetail.feedbackSaved") });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSavingFeedback(false);
    }
  }

  async function onDelete() {
    if (!await confirmDialog("Delete this showing? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/dashboard/showings/${showing.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to delete." });
        return;
      }
      router.push("/dashboard/showings");
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    }
  }

  const thankYouDraft = buildThankYouDraft({ propertyAddress: showing.property_address, agentName: null });
  const buyerSummaryDraft = buildBuyerSummaryDraft({
    propertyAddress: showing.property_address,
    contactName,
    feedback,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/showings" className="hover:underline">{t("pages.showingDetail.showings")}</Link>
          {" / "}
          <span>{showing.property_address}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {showing.property_address}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>{formatDateTime(showing.scheduled_at, locale)}</span>
          <span className="text-slate-400">·</span>
          <span>{t("pages.dashFragments.withWord")}{" "}
            <Link
              href={`/dashboard/showings?contactId=${encodeURIComponent(showing.contact_id)}`}
              className="text-blue-600 hover:underline"
            >
              {contactName ?? "(unknown buyer)"}
            </Link>
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {msg ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.tone === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          aria-live="polite"
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        {/* LEFT: details + status + feedback */}
        <div className="space-y-4 md:col-span-2">
          <Card title={t("pages.showingDetail.visitDetails")}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label={t("pages.showingDetail.mls")} value={showing.mls_number} />
              <Detail
                label={t("pages.showingDetail.listingUrl")}
                value={
                  showing.mls_url ? (
                    <a
                      href={showing.mls_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >{t("pages.showingDetail.openListing")}</a>
                  ) : null
                }
              />
              <Detail label={t("pages.showingDetail.duration")} value={showing.duration_minutes ? `${showing.duration_minutes} min` : null} />
              <Detail label={t("pages.showingDetail.location")} value={[showing.city, showing.state, showing.zip].filter(Boolean).join(", ") || null} />
              <Detail
                label={t("pages.showingDetail.access")}
                value={showing.access_notes || null}
                wide
              />
              <Detail
                label={t("pages.showingDetail.listingAgent")}
                wide
                value={
                  showing.listing_agent_name || showing.listing_agent_email || showing.listing_agent_phone ? (
                    <div className="space-y-0.5">
                      {showing.listing_agent_name ? <div>{showing.listing_agent_name}</div> : null}
                      {showing.listing_agent_email ? (
                        <div className="text-[11px] text-slate-500">{showing.listing_agent_email}</div>
                      ) : null}
                      {showing.listing_agent_phone ? (
                        <div className="text-[11px] text-slate-500">{showing.listing_agent_phone}</div>
                      ) : null}
                    </div>
                  ) : null
                }
              />
              <Detail label={t("pages.showingDetail.notes")} value={showing.notes} wide />
            </dl>
          </Card>

          <Card title={t("pages.showingDetail.status")}>
            <div className="flex flex-wrap gap-2">
              {(["scheduled", "attended", "cancelled", "no_show"] as ShowingStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void saveStatus(s)}
                  disabled={savingStatus || status === s}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    status === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  } disabled:opacity-60`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {t("pages.showingDetail.markBefore")} <strong>{t("pages.showingDetail.attended")}</strong>{t("pages.showingDetail.markAfter")}
            </p>
          </Card>

          <Card title={t("pages.showingDetail.buyerFeedback")}>
            <FeedbackEditor
              feedback={feedback}
              saving={savingFeedback}
              onChange={(patch) => void saveFeedback(patch)}
              disabled={status === "scheduled"}
            />
          </Card>
        </div>

        {/* RIGHT: sibling showings + quick actions */}
        <div className="space-y-4">
          <Card title={t("pages.showingDetail.quickActions")}>
            <div className="space-y-2">
              {/* "Create offer" is always available so an agent can
                  start drafting before/after the showing regardless
                  of feedback state. When the buyer's feedback flags
                  `would_offer`, the same button gets the amber
                  emphasis treatment + a hint subtitle so it stands
                  out as the obvious next step. Back-links the offer
                  to this showing so the history chain stays intact. */}
              {(() => {
                const isHot = feedback?.would_offer && status === "attended";
                return (
                  <Link
                    href={`/dashboard/offers/new?contactId=${encodeURIComponent(showing.contact_id)}&showingId=${encodeURIComponent(showing.id)}`}
                    className={
                      isHot
                        ? "block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                        : "block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    }
                  >
                    {t("pages.showingDetail.createOffer")}
                    {isHot ? (
                      <div className="text-[11px] font-normal text-amber-700">{t("pages.showingDetail.wouldOffer")}</div>
                    ) : null}
                  </Link>
                );
              })()}
              <a
                href={mailtoLink({
                  to: showing.listing_agent_email ?? "",
                  subject: `Thank you — showing at ${showing.property_address}`,
                  body: thankYouDraft,
                })}
                className={`block rounded-lg border px-3 py-2 text-sm ${
                  showing.listing_agent_email
                    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-200 bg-slate-50 text-slate-400 pointer-events-none"
                }`}
              >
                {t("pages.showingDetail.thankListingAgent")}
                {!showing.listing_agent_email ? (
                  <div className="text-[11px] text-slate-400">{t("pages.showingDetail.needAgentEmail")}</div>
                ) : null}
              </a>
              <a
                href={mailtoLink({
                  to: "",
                  subject: `Your showing at ${showing.property_address}`,
                  body: buyerSummaryDraft,
                })}
                className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("pages.showingDetail.sendSummaryToBuyer")}
              </a>
              <button
                type="button"
                onClick={() => void onDelete()}
                className="block w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                {t("pages.showingDetail.deleteShowing")}
              </button>
            </div>
          </Card>

          <Card title={`Other showings with ${contactName ?? "this buyer"} (${siblings.length})`}>
            {siblings.length === 0 ? (
              <p className="text-sm text-slate-500">{t("pages.showingDetail.noOtherShowings")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/showings/${s.id}`}
                      className="block rounded-lg border border-slate-100 p-2 hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{s.property_address}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{formatDateTime(s.scheduled_at, locale)}</span>
                        {s.feedback_reaction ? (
                          <span>
                            · {REACTION_LABEL[s.feedback_reaction].emoji}
                          </span>
                        ) : null}
                        {s.feedback_would_offer ? (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                            offer
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeedbackEditor({
  feedback,
  saving,
  disabled,
  onChange,
}: {
  feedback: ShowingFeedbackRow | null;
  saving: boolean;
  disabled: boolean;
  onChange: (patch: Partial<ShowingFeedbackRow>) => void;
}) {
  const { t } = useTranslation("dashboard");
  if (disabled) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {t("pages.showingDetail.feedbackBefore")} <strong>{t("pages.showingDetail.attended")}</strong>{t("pages.showingDetail.feedbackAfter")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t("pages.showingDetail.overallReaction")}</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(REACTION_LABEL) as OverallReaction[]).map((r) => {
            const selected = feedback?.overall_reaction === r;
            const conf = REACTION_LABEL[r];
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ overall_reaction: selected ? null : r })}
                disabled={saving}
                className={`rounded-lg border px-3 py-1.5 text-sm ${selected ? conf.tone : "border-slate-200 bg-white hover:bg-slate-50"} disabled:opacity-60`}
              >
                <span className="mr-1">{conf.emoji}</span>
                {t(conf.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">{t("pages.showingDetail.rating")}</label>
        <div className="mt-1 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (feedback?.rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                disabled={saving}
                onClick={() => onChange({ rating: feedback?.rating === n ? null : n })}
                className={`h-8 w-8 rounded-full text-base ${active ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            );
          })}
          {feedback?.rating ? (
            <button
              type="button"
              onClick={() => onChange({ rating: null })}
              disabled={saving}
              className="ml-2 text-[11px] text-slate-500 hover:underline"
            >{t("pages.showingDetail.clear")}</button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.showingDetail.whatWorked")}</label>
          <textarea
            defaultValue={feedback?.pros ?? ""}
            onBlur={(e) => onChange({ pros: e.target.value.trim() || null })}
            rows={3}
            placeholder={t("pages.showingDetail.whatWorkedPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.showingDetail.concerns")}</label>
          <textarea
            defaultValue={feedback?.cons ?? ""}
            onBlur={(e) => onChange({ cons: e.target.value.trim() || null })}
            rows={3}
            placeholder={t("pages.showingDetail.concernsPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">{t("pages.showingDetail.internalNotes")}</label>
        <textarea
          defaultValue={feedback?.notes ?? ""}
          onBlur={(e) => onChange({ notes: e.target.value.trim() || null })}
          rows={2}
          placeholder={t("pages.showingDetail.internalNotesPlaceholder")}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
        <ConcernCheckbox
          label={t("pages.showingDetail.wouldOffer")}
          checked={feedback?.would_offer ?? false}
          onChange={(v) => onChange({ would_offer: v })}
          accent="amber"
          disabled={saving}
        />
        <ConcernCheckbox
          label={t("pages.showingDetail.priceConcern")}
          checked={feedback?.price_concerns ?? false}
          onChange={(v) => onChange({ price_concerns: v })}
          disabled={saving}
        />
        <ConcernCheckbox
          label={t("pages.showingDetail.locationConcern")}
          checked={feedback?.location_concerns ?? false}
          onChange={(v) => onChange({ location_concerns: v })}
          disabled={saving}
        />
        <ConcernCheckbox
          label={t("pages.showingDetail.conditionConcern")}
          checked={feedback?.condition_concerns ?? false}
          onChange={(v) => onChange({ condition_concerns: v })}
          disabled={saving}
        />
      </div>
    </div>
  );
}

function ConcernCheckbox({
  label,
  checked,
  onChange,
  disabled,
  accent,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accent?: "amber";
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${disabled ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className={accent === "amber" ? "font-medium text-amber-700" : "text-slate-700"}>
        {label}
      </span>
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

/**
 * Build a `mailto:` link with subject + body query parameters. We don't
 * use URLSearchParams here because it encodes spaces as `+` (per the
 * application/x-www-form-urlencoded form encoding it implements), and
 * Outlook + some other mail clients render that literal `+` instead of
 * decoding it back to a space. RFC 6068 specifies that mailto query
 * components must percent-encode spaces as `%20`, which is what
 * `encodeURIComponent` produces.
 */
function mailtoLink({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const parts: string[] = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  const query = parts.length ? `?${parts.join("&")}` : "";
  return `mailto:${encodeURIComponent(to)}${query}`;
}

function buildThankYouDraft(opts: { propertyAddress: string; agentName: string | null }): string {
  return [
    `Hi${opts.agentName ? ` ${opts.agentName}` : ""},`,
    "",
    `Thanks for letting us view ${opts.propertyAddress} today — access was smooth.`,
    "",
    "I'll circle back with my buyer's feedback once they've had a chance to mull it over.",
    "",
    "Best,",
  ].join("\n");
}

function buildBuyerSummaryDraft(opts: {
  propertyAddress: string;
  contactName: string | null;
  feedback: ShowingFeedbackRow | null;
}): string {
  const lines: string[] = [
    `Hi${opts.contactName ? ` ${opts.contactName.split(" ")[0]}` : ""},`,
    "",
    `Quick recap of our showing at ${opts.propertyAddress}:`,
  ];
  if (opts.feedback?.pros) {
    lines.push("", "What worked:");
    lines.push(opts.feedback.pros);
  }
  if (opts.feedback?.cons) {
    lines.push("", "Things to consider:");
    lines.push(opts.feedback.cons);
  }
  if (opts.feedback?.would_offer) {
    lines.push("", "Next step: you mentioned you'd like to explore an offer — happy to walk through pricing + terms whenever you're ready.");
  } else {
    lines.push("", "Next step: let me know if you'd like to see more like this, or if we should adjust the search.");
  }
  lines.push("", "Thanks,");
  return lines.join("\n");
}

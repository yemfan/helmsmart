"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Avatar } from "@helm/ui";
import { decideApproval, dismissUnconfirmedApproval } from "@/lib/actions/approvals";
import { announceApprovalsChanged } from "@/lib/approval-events";
import { moneyFormatter } from "@/lib/books-format";
import {
  ACTION_KEYS,
  MESSAGE_MAX,
  type ApprovalView,
  type DecideApprovalResult,
} from "@/lib/ai-team/approval-view";
import { approvalFingerprintAsync } from "@/lib/ai-team/fingerprint";

/**
 * One thing the AI team wants to do for a customer, waiting for the owner.
 * The same card in the Ask Mark panel (under Mark's answer) and in "Needs
 * your approval" on /home.
 *
 * The card never shows a state the database does not hold: Approve and
 * Decline stay put until the server answers, and the card then shows the row
 * as it now stands — "Sent!" on the button that sent it, or the real reason
 * it didn't go (an opt-out, a missing email) below the buttons in rose. A
 * decision is final, so the confirmation stays on the button rather than
 * fading back to "Approve".
 *
 * Approving sends a fingerprint of exactly what this card shows (recipient,
 * number or email, amount, and the message as typed); the server refuses if
 * that is no longer what would go out. A send that never reported back is
 * shown as unconfirmed and can only be dismissed — never re-sent.
 */
/**
 * A call's purpose to its bundle key. A literal map, not `` t(`…${value}`) ``:
 * a key built from a stored value renders itself when the value is anything the
 * bundle doesn't have, and no i18n guard can see that coming.
 */
const CALL_PURPOSE_KEYS: Record<string, string> = {
  follow_up: "aiApprovals.callPurpose.follow_up",
  appointment_reminder: "aiApprovals.callPurpose.appointment_reminder",
  survey: "aiApprovals.callPurpose.survey",
  promo: "aiApprovals.callPurpose.promo",
};

/** Network names are brands — the same word in every language. */
const NETWORK_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X",
};
const networkLabel = (network: string) => NETWORK_LABELS[network] ?? network;

/** An instant in the reader's language — the post's own time, as the browser reads it. */
function formatInstant(locale: string, iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function ApprovalCard({
  approval,
  onDecided,
  refreshOnDecide = false,
}: {
  approval: ApprovalView;
  /** Called with the row as it stands after a decision (or a refused one). */
  onDecided?: (view: ApprovalView) => void;
  /** Re-render the page's server data after deciding (the panel does; /home keeps its layout still). */
  refreshOnDecide?: boolean;
}) {
  const { t, i18n } = useTranslation("home");
  const router = useRouter();
  const messageId = useId();

  const [view, setView] = useState(approval);
  const [message, setMessage] = useState(approval.details.message ?? "");
  const [pending, setPending] = useState<"approve" | "decline" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setView(approval);
    setMessage(approval.details.message ?? "");
  }, [approval]);

  const d = view.details;
  const who = view.employee.name;
  const amount = typeof d.amount === "number" ? moneyFormatter(i18n.language, d.currency)(d.amount) : "";
  // A call's purpose is one of four known keys, never free text from the
  // database — so the label is looked up through a map rather than by building
  // a key out of a value, which would print the raw key when it doesn't match.
  const purposeLabel = d.callPurpose && CALL_PURPOSE_KEYS[d.callPurpose] ? t(CALL_PURPOSE_KEYS[d.callPurpose]) : d.callPurpose;
  const postWhen = d.scheduledFor ? formatInstant(i18n.language, d.scheduledFor) : null;
  const summary =
    view.actionKey === ACTION_KEYS.sendInvoiceReminder && d.clientName && d.invoiceNumber
      ? t("aiApprovals.summary.sendInvoiceReminder", { who, name: d.clientName, invoice: d.invoiceNumber, amount })
      : view.actionKey === ACTION_KEYS.textClient && d.clientName && d.phone
        ? t("aiApprovals.summary.textClient", { who, name: d.clientName, phone: d.phone })
        : view.actionKey === ACTION_KEYS.replyToText && d.clientName && d.phone
          ? t("aiApprovals.summary.replyToText", { who, name: d.clientName, phone: d.phone })
          : view.actionKey === ACTION_KEYS.scheduleAiCall && d.clientName && d.phone && purposeLabel
            ? t("aiApprovals.summary.scheduleAiCall", { who, name: d.clientName, phone: d.phone, purpose: purposeLabel })
            : view.actionKey === ACTION_KEYS.draftSocialPost && d.network
              ? postWhen
                ? t("aiApprovals.summary.draftSocialPostScheduled", { who, network: networkLabel(d.network), when: postWhen })
                : t("aiApprovals.summary.draftSocialPostDraft", { who, network: networkLabel(d.network) })
              : view.actionKey === ACTION_KEYS.bookAppointment && d.clientName && d.slotLabel && d.appointmentType
                ? t(d.reschedulesFrom ? "aiApprovals.summary.bookAppointmentMove" : "aiApprovals.summary.bookAppointment", {
                    who,
                    name: d.clientName,
                    type: d.appointmentType,
                    when: d.slotLabel,
                  })
                : view.summary;

  const proposed = view.status === "proposed";
  const unconfirmed = view.status === "unconfirmed";
  // A dismissed send isn't a failure to act on — its note reads in slate below.
  const shownError = error ?? (view.status === "failed" && !view.dismissed ? view.error : null);

  function settle(res: DecideApprovalResult, wasWaiting: boolean) {
    if (res.view) {
      setView(res.view);
      onDecided?.(res.view);
      if (wasWaiting && res.view.status !== "proposed") announceApprovalsChanged(-1);
    }
    // Already translated where it was written (the server action).
    if (!res.ok) setError(res.error);
    if (refreshOnDecide) router.refresh();
  }

  async function decide(decision: "approve" | "decline") {
    if (pending || !proposed) return;
    if (decision === "approve" && view.editable && !message.trim()) {
      setError(t("aiApprovals.errors.emptyMessage"));
      return;
    }
    setPending(decision);
    setError(null);
    // What this card shows, with the message as the owner left it.
    let fingerprint: string | undefined;
    if (decision === "approve" && view.executable) {
      try {
        fingerprint = await approvalFingerprintAsync(view.actionKey, {
          ...d,
          message: view.editable ? message : d.message,
        });
      } catch (e) {
        // No Web Crypto here, so we cannot prove what was shown — and the
        // server refuses an approval it cannot check. Say so, don't send.
        console.error("fingerprinting an approval", e);
        setPending(null);
        setError(t("aiApprovals.errors.failed"));
        return;
      }
    }
    let res: DecideApprovalResult;
    try {
      res = await decideApproval(view.id, decision, { message: view.editable ? message : undefined, fingerprint });
    } catch (e) {
      console.error("deciding an approval", e);
      setPending(null);
      setError(t("aiApprovals.errors.network"));
      return;
    }
    setPending(null);
    settle(res, true);
  }

  async function dismiss() {
    if (pending || !unconfirmed) return;
    setPending("dismiss");
    setError(null);
    let res: DecideApprovalResult;
    try {
      res = await dismissUnconfirmedApproval(view.id);
    } catch (e) {
      console.error("dismissing an unconfirmed approval", e);
      setPending(null);
      setError(t("aiApprovals.errors.network"));
      return;
    }
    setPending(null);
    // It was never in the waiting count, so the badge doesn't move.
    settle(res, false);
  }

  const approveLabel =
    pending === "approve"
      ? view.executable
        ? t("aiApprovals.card.approving")
        : t("aiApprovals.card.markDone")
      : view.status === "executed"
        ? t("aiApprovals.card.sent")
        : view.status === "approved"
          ? // Someone's approval is sending right now; a manual row's approval is its end.
            view.executable
            ? t("aiApprovals.card.approving")
            : t("aiApprovals.card.done")
          : view.executable
            ? t("aiApprovals.card.approve")
            : t("aiApprovals.card.markDone");

  return (
    <div role="group" aria-label={summary} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-start gap-2.5">
        {view.employee.avatar ? (
          <Avatar id={view.employee.avatar} size={28} alt="" className="mt-0.5 shrink-0 rounded-full" />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium text-slate-800">{summary}</p>

          {d.kind === "invoice_reminder" && d.clientName && d.email ? (
            <p className="text-xs text-slate-500">
              {t("aiApprovals.card.emailTo", { name: d.clientName, email: d.email })}
              {typeof d.daysOverdue === "number" && d.daysOverdue > 0
                ? ` · ${t("aiApprovals.card.overdue", { count: d.daysOverdue })}`
                : null}
            </p>
          ) : null}

          {/* What the customer said, above the reply that answers it. Quiet
              text: it is context for the decision, not the decision. */}
          {d.incomingMessage ? (
            <div className="border-l-2 border-slate-200 pl-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("aiApprovals.card.incomingLabel")}</p>
              <p className="whitespace-pre-wrap text-xs text-slate-600">{d.incomingMessage}</p>
            </div>
          ) : null}

          {d.kind === "call" ? (
            <>
              {d.note ? <p className="text-xs text-slate-600">{t("aiApprovals.card.callNote", { note: d.note })}</p> : null}
              <p className="text-xs text-slate-500">{t("aiApprovals.card.quietHours")}</p>
            </>
          ) : null}

          {d.kind === "social" && d.note ? (
            <p className="text-xs text-slate-500">{t("aiApprovals.card.topic", { topic: d.note })}</p>
          ) : null}

          {d.kind === "text" || d.kind === "social" || (d.kind === "appointment" && d.message) ? (
            proposed && view.editable ? (
              <div>
                <label htmlFor={messageId} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {t(d.kind === "social" ? "aiApprovals.card.postLabel" : "aiApprovals.card.messageLabel")}
                </label>
                <textarea
                  id={messageId}
                  value={message}
                  maxLength={MESSAGE_MAX}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setError(null);
                  }}
                  rows={d.kind === "social" ? 5 : 3}
                  disabled={!!pending}
                  // 16px below md so iOS doesn't zoom the sheet when the field takes focus.
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-800 focus:border-blue-400 focus:outline-none md:text-sm"
                />
              </div>
            ) : d.message ? (
              <>
                {d.kind === "appointment" ? (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t("aiApprovals.card.confirmationLabel")}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{d.message}</p>
              </>
            ) : null
          ) : null}

          {d.kind === "social" ? (
            <p className="text-xs text-slate-500">
              {postWhen ? t("aiApprovals.card.postAt", { when: postWhen }) : t("aiApprovals.card.postDraft")}
            </p>
          ) : null}

          {d.kind === "appointment" ? (
            <>
              {d.reschedulesFrom ? (
                <p className="text-xs text-slate-600">{t("aiApprovals.card.movesFrom", { when: d.reschedulesFrom })}</p>
              ) : null}
              {!d.message && d.clientName ? (
                <p className="text-xs text-slate-500">{t("aiApprovals.card.noConfirmation", { name: d.clientName })}</p>
              ) : null}
            </>
          ) : null}

          {!view.executable && d.note ? <p className="text-xs text-slate-600">{d.note}</p> : null}
          {!view.executable && proposed ? (
            <p className="text-xs text-slate-500">{t("aiApprovals.card.manualHint", { who })}</p>
          ) : null}
          {view.status === "expired" ? <p className="text-xs text-slate-500">{t("aiApprovals.card.expired")}</p> : null}
          {unconfirmed ? <p className="text-xs font-medium text-amber-700">{t("aiApprovals.card.unconfirmed")}</p> : null}
        </div>
      </div>

      {unconfirmed ? (
        // No retry: it may already have reached the customer.
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-0 sm:pl-[38px]">
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={!!pending}
            aria-describedby={shownError ? `${messageId}-error` : undefined}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {pending === "dismiss" ? t("aiApprovals.card.dismissing") : t("aiApprovals.card.dismiss")}
          </button>
        </div>
      ) : view.status !== "expired" && view.status !== "failed" ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-0 sm:pl-[38px]">
          {view.status !== "declined" ? (
            <button
              type="button"
              onClick={() => void decide("approve")}
              disabled={!proposed || !!pending}
              aria-describedby={shownError ? `${messageId}-error` : undefined}
              // Once it went, the confirmation is the state of the thing, not a
              // greyed-out control: full colour, no hover.
              className={`rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white ${
                view.status === "executed" || view.status === "approved" ? "" : "hover:bg-emerald-700 disabled:opacity-60"
              }`}
            >
              {approveLabel}
            </button>
          ) : null}
          {view.status === "proposed" || view.status === "declined" ? (
            <button
              type="button"
              onClick={() => void decide("decline")}
              disabled={!proposed || !!pending}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {pending === "decline"
                ? t("aiApprovals.card.declining")
                : view.status === "declined"
                  ? t("aiApprovals.card.declined")
                  : t("aiApprovals.card.decline")}
            </button>
          ) : null}
        </div>
      ) : view.status === "failed" ? (
        <p className="mt-2 text-xs font-medium text-slate-500 sm:pl-[38px]">
          {view.dismissed ? t("aiApprovals.card.dismissed") : t("aiApprovals.card.failed")}
        </p>
      ) : null}

      {view.dismissed && view.error ? <p className="mt-1 text-xs text-slate-500 sm:pl-[38px]">{view.error}</p> : null}

      {shownError ? (
        <p id={`${messageId}-error`} className="mt-1.5 text-xs text-rose-600 sm:pl-[38px]" role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

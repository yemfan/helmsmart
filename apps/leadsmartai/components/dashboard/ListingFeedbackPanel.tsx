"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { ListingFeedbackRow } from "@/lib/listing-feedback/types";

const REACTION_EMOJI: Record<string, string> = {
  love: "❤️",
  like: "👍",
  maybe: "🤔",
  pass: "👎",
};

const PRICE_LABEL: Record<string, string> = {
  too_high: "Too high",
  about_right: "About right",
  bargain: "Bargain",
};

type FetchResponse = {
  ok?: boolean;
  feedback?: ListingFeedbackRow[];
  error?: string;
};

/**
 * Cross-agent feedback panel on listing transaction detail.
 *
 * Two sections:
 *   - "Received" — responses from buyer agents (newest first).
 *   - "Pending" — requests sent or ready to send (not yet responded).
 *
 * Agent can add a new request inline, send / resend the request email,
 * and delete a stale row.
 */
export function ListingFeedbackPanel({ transactionId }: { transactionId: string }) {
  const [rows, setRows] = useState<ListingFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/transactions/${transactionId}/listing-feedback`,
      );
      const body = (await res.json().catch(() => null)) as FetchResponse | null;
      if (!res.ok || !body || !body.ok || !Array.isArray(body.feedback)) {
        setError(body?.error ?? "Failed to load feedback.");
        return;
      }
      setRows(body.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const received = useMemo(() => rows.filter((r) => r.submitted_at), [rows]);
  const pending = useMemo(() => rows.filter((r) => !r.submitted_at), [rows]);
  const avgRating = useMemo(() => {
    const ratings = received.map((r) => r.rating).filter((n): n is number => n != null);
    if (!ratings.length) return null;
    return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  }, [received]);

  async function sendRequest(id: string) {
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/listing-feedback/${id}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to send." });
        return;
      }
      setMsg({ tone: "ok", text: "Email sent." });
      await load();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this feedback row?")) return;
    try {
      const res = await fetch(`/api/dashboard/listing-feedback/${id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && body.ok) {
        await load();
      }
    } catch {
      /* non-fatal */
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            💬 Buyer-agent feedback
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Request and collect candid feedback from buyer agents who showed this listing.
            Shared link — no login needed for them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          {showAdd ? "Cancel" : "+ Add request"}
        </button>
      </div>

      {showAdd ? (
        <AddRequestForm
          transactionId={transactionId}
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
        />
      ) : null}

      {msg ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            msg.tone === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-xs text-slate-400">Loading feedback…</div>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {avgRating != null ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <span className="font-semibold text-slate-900">
                ⭐ {avgRating} / 5
              </span>
              <span className="ml-2 text-xs text-slate-500">
                average across {received.length} response{received.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}

          {received.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Received ({received.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {received.map((r) => (
                  <ReceivedCard key={r.id} row={r} onDelete={() => void deleteRow(r.id)} />
                ))}
              </ul>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pending ({pending.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {pending.map((r) => (
                  <PendingCard
                    key={r.id}
                    row={r}
                    onSend={() => void sendRequest(r.id)}
                    onDelete={() => void deleteRow(r.id)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-xs text-slate-500">
              No feedback yet. Click <strong>+ Add request</strong> after a buyer agent shows the
              listing.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ReceivedCard({
  row,
  onDelete,
}: {
  row: ListingFeedbackRow;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <li className="rounded-lg border border-slate-100 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">
            {row.buyer_agent_name ?? "(unknown buyer agent)"}
            {row.buyer_agent_brokerage ? (
              <span className="font-normal text-slate-500"> · {row.buyer_agent_brokerage}</span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {row.showing_date ? <span>Showing: {row.showing_date}</span> : null}
            {row.submitted_at ? (
              <span>{t("pages.listingFeedback.submittedAt", { date: new Date(row.submitted_at).toLocaleDateString(locale) })}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.overall_reaction ? (
            <span className="text-xl" title={row.overall_reaction}>
              {REACTION_EMOJI[row.overall_reaction]}
            </span>
          ) : null}
          {row.rating ? (
            <span className="text-xs font-semibold text-slate-700">{row.rating}/5</span>
          ) : null}
        </div>
      </div>

      {row.pros ? (
        <div className="mt-2 rounded bg-green-50 px-2 py-1 text-xs text-green-800">
          <strong>{t("pages.oneWord.worked")}</strong> {row.pros}
        </div>
      ) : null}
      {row.cons ? (
        <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          <strong>{t("pages.oneWord.concerns")}</strong> {row.cons}
        </div>
      ) : null}
      {row.price_feedback ? (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
          Price: {PRICE_LABEL[row.price_feedback]}
        </div>
      ) : null}
      {row.would_offer === true ? (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          Considering an offer
        </div>
      ) : null}
      {row.notes ? (
        <p className="mt-2 text-xs text-slate-600">{row.notes}</p>
      ) : null}

      <button
        type="button"
        onClick={onDelete}
        className="mt-2 text-[10px] text-red-500 hover:underline"
      >
        Delete
      </button>
    </li>
  );
}

function PendingCard({
  row,
  onSend,
  onDelete,
}: {
  row: ListingFeedbackRow;
  onSend: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <li className="rounded-lg border border-dashed border-slate-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">
            {row.buyer_agent_name ?? "(unknown buyer agent)"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {row.buyer_agent_email ?? "No email on file"}
            {row.showing_date ? ` · ${row.showing_date}` : ""}
          </div>
          {row.request_email_sent_at ? (
            <div className="mt-1 text-[11px] text-slate-400">
              {t("pages.listingFeedback.requestedAt", { date: new Date(row.request_email_sent_at).toLocaleString(locale) })}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onSend}
            disabled={!row.buyer_agent_email}
            className="rounded-lg bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            title={!row.buyer_agent_email ? "Add buyer-agent email to enable" : ""}
          >
            {row.request_email_sent_at ? "Resend" : "Send request"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-white px-3 py-1 text-[11px] text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function AddRequestForm({
  transactionId,
  onCreated,
}: {
  transactionId: string;
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [buyerAgentName, setBuyerAgentName] = useState("");
  const [buyerAgentEmail, setBuyerAgentEmail] = useState("");
  const [buyerAgentBrokerage, setBuyerAgentBrokerage] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [showingDate, setShowingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/dashboard/transactions/${transactionId}/listing-feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buyerAgentName: buyerAgentName.trim() || null,
            buyerAgentEmail: buyerAgentEmail.trim() || null,
            buyerAgentBrokerage: buyerAgentBrokerage.trim() || null,
            buyerName: buyerName.trim() || null,
            showingDate: showingDate || null,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.error ?? "Failed to add.");
        return;
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={buyerAgentName}
          onChange={(e) => setBuyerAgentName(e.target.value)}
          placeholder={t("pages.listingFeedback.agentName")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="email"
          value={buyerAgentEmail}
          onChange={(e) => setBuyerAgentEmail(e.target.value)}
          placeholder={t("pages.listingFeedback.agentEmail")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={buyerAgentBrokerage}
          onChange={(e) => setBuyerAgentBrokerage(e.target.value)}
          placeholder={t("pages.listingFeedback.brokerage")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          placeholder={t("pages.listingFeedback.buyerName")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={showingDate}
          onChange={(e) => setShowingDate(e.target.value)}
          placeholder={t("pages.listingFeedback.showingDate")}
          className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add request"}
      </button>
      <p className="text-[11px] text-slate-500">
        This creates a pending request. The &quot;Send request&quot; button emails the form link to
        the buyer agent.
      </p>
    </div>
  );
}

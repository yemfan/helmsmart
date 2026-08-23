"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import type { DraftStatus, MessageDraftView } from "@/lib/drafts/types";
import { LoadingText } from "@/components/ui/LoadingText";

const STATUS_LABELS: Record<DraftStatus | "all", string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
  failed: "Failed",
  all: "All",
};

export default function DraftsClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<DraftStatus | "all">("pending");
  const [drafts, setDrafts] = useState<MessageDraftView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: DraftStatus | "all") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/drafts?status=${encodeURIComponent(status)}`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        drafts?: MessageDraftView[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setDrafts(data.drafts ?? []);
      if ((data.drafts ?? []).length && !data.drafts!.some((d) => d.id === selectedId)) {
        setSelectedId(data.drafts![0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const selected = useMemo(
    () => drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null,
    [drafts, selectedId],
  );

  function applyUpdate(next: MessageDraftView) {
    setDrafts((prev) => prev.map((d) => (d.id === next.id ? next : d)));
  }

  function removeDraft(id: string) {
    // When the filter is "pending", approved/rejected drafts disappear from view.
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,400px)_1fr]">
      <aside className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(STATUS_LABELS) as (DraftStatus | "all")[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  filter === s
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400">{drafts.length} shown</span>
        </div>
        <div className="max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-gray-500"><LoadingText /></div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : drafts.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {drafts.map((d) => (
                <li key={d.id}>
                  <DraftListItem
                    draft={d}
                    active={selected?.id === d.id}
                    onSelect={() => setSelectedId(d.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="min-h-[400px] rounded-xl border border-gray-200 bg-white">
        {selected ? (
          <DraftDetail
            draft={selected}
            onUpdate={applyUpdate}
            onRemoveFromList={removeDraft}
            currentFilter={filter}
          />
        ) : (
          <div className="p-8 text-sm text-gray-500">{t("pages.drafts.selectDraft")}</div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ filter }: { filter: DraftStatus | "all" }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (filter === "pending") {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <div className="font-medium text-gray-700">{t("pages.drafts.noDrafts")}</div>
        <p className="mt-1">{t("pages.dashFragments.draftLandsHere")}{" "}
          <Link href="/dashboard/sphere" className="text-brand-accent-text hover:underline">{t("pages.drafts.openContact")}</Link>{" "}{t("pages.dashFragments.clickGenerate")}</p>
      </div>
    );
  }
  return (
    <div className="p-8 text-center text-sm text-gray-500">
      No {STATUS_LABELS[filter].toLowerCase()} drafts.
    </div>
  );
}

function DraftListItem({
  draft,
  active,
  onSelect,
}: {
  draft: MessageDraftView;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[auto_1fr_auto] gap-2 px-3 py-3 text-left transition-colors ${
        active ? "bg-brand-accent/5" : "hover:bg-gray-50"
      }`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ background: draft.contactAvatarColor ?? "#6B5D4E" }}
      >
        {draft.contactInitials}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-gray-900">
            {draft.contactFullName}
          </span>
          {draft.edited && (
            <span className="rounded bg-amber-50 px-1 text-[9px] font-semibold uppercase text-amber-700">
              edited
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              draft.channel === "sms"
                ? "bg-blue-50 text-blue-700"
                : "bg-violet-50 text-violet-700"
            }`}
          >
            {draft.channel}
          </span>
          {draft.templateName && <span className="truncate">{draft.templateName}</span>}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-gray-500">
          {draft.body.slice(0, 80)}
        </span>
      </span>
      <StatusPill status={draft.status} />
    </button>
  );
}

function StatusPill({ status }: { status: DraftStatus }) {
  const cls =
    status === "pending"
      ? "bg-amber-50 text-amber-700"
      : status === "approved"
        ? "bg-blue-50 text-blue-700"
        : status === "sent"
          ? "bg-green-50 text-green-700"
          : status === "rejected"
            ? "bg-gray-100 text-gray-500"
            : "bg-red-50 text-red-700";
  const label =
    status === "pending"
      ? "Pending"
      : status === "approved"
        ? "Approved"
        : status === "sent"
          ? "Sent"
          : status === "rejected"
            ? "Rejected"
            : "Failed";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function DraftDetail({
  draft,
  onUpdate,
  onRemoveFromList,
  currentFilter,
}: {
  draft: MessageDraftView;
  onUpdate: (next: MessageDraftView) => void;
  onRemoveFromList: (id: string) => void;
  currentFilter: DraftStatus | "all";
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [saving, setSaving] = useState<null | "edit" | "approve" | "reject" | "dispatch">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSubject(draft.subject ?? "");
    setBody(draft.body);
    setShowRejectBox(false);
    setRejectReason("");
    setError(null);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  const isPending = draft.status === "pending";
  const dirty =
    (draft.channel === "email" && subject !== (draft.subject ?? "")) || body !== draft.body;

  async function call(
    label: "edit" | "approve" | "reject" | "dispatch",
    payload: Record<string, unknown>,
  ) {
    setSaving(label);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/dashboard/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        draft?: MessageDraftView;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `${label} failed`);
      // The API returns MessageDraft (no view join). Preserve view fields.
      const merged: MessageDraftView = { ...draft, ...(data.draft ?? {}) } as MessageDraftView;
      onUpdate(merged);
      return merged;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `${label} failed`;
      setError(msg);
      throw e;
    } finally {
      setSaving(null);
    }
  }

  async function saveEdit() {
    const next = await call("edit", {
      action: "edit",
      subject: draft.channel === "email" ? subject : null,
      body,
    }).catch(() => null);
    if (next) setMessage("Saved.");
  }

  async function approve() {
    const next = await call("approve", { action: "approve" }).catch(() => null);
    if (next) {
      setMessage("Approved. A sender worker will dispatch this draft.");
      if (currentFilter === "pending") onRemoveFromList(draft.id);
    }
  }

  async function reject() {
    const next = await call("reject", {
      action: "reject",
      reason: rejectReason.trim() || null,
    }).catch(() => null);
    if (next) {
      setMessage("Rejected.");
      setShowRejectBox(false);
      setRejectReason("");
      if (currentFilter === "pending") onRemoveFromList(draft.id);
    }
  }

  async function dispatchNow() {
    setSaving("dispatch");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/dashboard/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        draft?: MessageDraftView;
        result?: { outcomes?: { reason: string; detail?: string }[] };
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Dispatch failed");
      const reason = data.result?.outcomes?.[0]?.reason;
      const detail = data.result?.outcomes?.[0]?.detail;
      if (data.draft) {
        const merged: MessageDraftView = { ...draft, ...data.draft } as MessageDraftView;
        onUpdate(merged);
      }
      if (reason === "sent") setMessage("Sent.");
      else if (reason) setMessage(`Deferred: ${reason}${detail ? ` — ${detail}` : ""}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dispatch failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/dashboard/sphere/${draft.contactId}`}
              className="text-sm font-semibold text-gray-900 hover:underline"
            >
              {draft.contactFullName}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  draft.channel === "sms"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-violet-50 text-violet-700"
                }`}
              >
                {draft.channel}
              </span>
              {draft.templateName && (
                <span className="font-mono text-[10px] text-gray-500">
                  {draft.templateId} · {draft.templateName}
                </span>
              )}
              <StatusPill status={draft.status} />
              <span>{t("pages.drafts.created", { date: new Date(draft.createdAt).toLocaleString(locale) })}</span>
              {draft.approvedAt && (
                <span className="text-blue-700">
                  {t("pages.drafts.approved", { date: new Date(draft.approvedAt).toLocaleString(locale) })}
                </span>
              )}
              {draft.rejectedAt && (
                <span>{t("pages.drafts.rejected", { date: new Date(draft.rejectedAt).toLocaleString(locale) })}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 divide-gray-100 lg:grid-cols-2 lg:divide-x">
        <div className="flex flex-col gap-3 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {isPending ? t("common:actions.edit") : t("common:actions.view")}
          </div>
          {draft.channel === "email" && (
            <label className="block">
              <span className="text-[11px] font-medium text-gray-500">{t("pages.drafts.subject")}</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!isPending}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
          )}
          <label className="block flex-1">
            <span className="text-[11px] font-medium text-gray-500">{t("pages.drafts.body")}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!isPending}
              rows={draft.channel === "sms" ? 6 : 14}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed disabled:bg-gray-50"
            />
          </label>

          {isPending ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={!dirty || saving !== null}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving === "edit" ? t("common:status.saving") : t("pages.drafts.saveEdit")}
              </button>
              <button
                type="button"
                onClick={() => void approve()}
                disabled={saving !== null}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving === "approve" ? t("common:status.approving") : t("pages.bossAssistant.approveSend")}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectBox((v) => !v)}
                disabled={saving !== null}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >{t("pages.drafts.reject")}</button>
              {message && <span className="text-sm text-green-700">{message}</span>}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          ) : (
            <div className="border-t border-gray-100 pt-3 text-xs text-gray-500 space-y-2">
              {draft.status === "approved" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{t("pages.dashFragments.queuedCron")}{draft.scheduledFor && (
                      <>{t("pages.drafts.earliestSend", { date: new Date(draft.scheduledFor).toLocaleString(locale) })}</>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void dispatchNow()}
                    disabled={saving !== null}
                    className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {saving === "dispatch" ? t("common:status.sending") : t("pages.drafts.sendNow")}
                  </button>
                  {message && <span className="text-green-700">{message}</span>}
                  {error && <span className="text-red-600">{error}</span>}
                </div>
              )}
              {draft.status === "rejected" &&
                (draft.rejectedReason
                  ? t("pages.drafts.rejectedReason", { reason: draft.rejectedReason })
                  : t("pages.drafts.rejectedNoReason"))}
              {draft.status === "sent" &&
                t("pages.drafts.sent", { date: draft.sentAt ? new Date(draft.sentAt).toLocaleString(locale) : "" })}
              {draft.status === "failed" &&
                (draft.failureReason ?? t("pages.drafts.sendFailed"))}
            </div>
          )}

          {showRejectBox && isPending && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block">
                <span className="text-[11px] font-medium text-gray-500">{t("pages.drafts.reason")}</span>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t("pages.drafts.reasonPlaceholder")}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={saving !== null}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {saving === "reject" ? t("common:status.rejecting") : t("pages.drafts.confirmReject")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectBox(false)}
                  className="rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-100"
                >{t("pages.drafts.cancel")}</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            To
          </div>
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="font-medium text-gray-900">{draft.contactFullName}</div>
            <div className="text-xs text-gray-500">
              {draft.channel === "sms" ? draft.contactPhone ?? "(no phone)" : draft.contactEmail ?? "(no email)"}
            </div>
          </div>

          {Object.keys(draft.triggerContext).length > 0 && (
            <>
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("pages.drafts.triggerContext")}</div>
              <pre className="mt-2 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-700">
                {JSON.stringify(draft.triggerContext, null, 2)}
              </pre>
            </>
          )}

          <p className="mt-4 text-[11px] text-gray-400">
            Spec §2.4: no draft sends automatically. Approval dispatches to the sender worker (Twilio /
            SendGrid integration is a follow-up).
          </p>
        </div>
      </section>
    </div>
  );
}

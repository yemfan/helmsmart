"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { Check, Plus } from "lucide-react";
import { getPlaybook, type PlaybookAnchor } from "@/lib/playbooks/definitions";
import type { PlaybookTaskRow } from "@/lib/playbooks/types";

type PlaybookMeta = {
  key: string;
  category: string;
  title: string;
  description: string;
  validAnchors: PlaybookAnchor[];
  anchorHint: string;
  itemCount: number;
  items: PlaybookItemMeta[];
};

type PlaybookItemMeta = {
  title: string;
  section: string | null;
  offsetDays: number;
  notes: string | null;
};

/**
 * Reusable playbook panel — drops onto any detail page. Shows tasks
 * for this anchor grouped by (section) within (applied playbook
 * batch). Lets the agent apply a new playbook, tick items, and
 * remove the whole batch if they applied one by mistake.
 *
 * Props:
 *   - anchorKind / anchorId: what this panel is anchored to
 *   - defaultAnchorDate: YYYY-MM-DD to pre-fill in the apply modal
 *                        (transaction's mutual_acceptance, open
 *                        house's start_at, etc.)
 */
export function PlaybooksPanel({
  anchorKind,
  anchorId,
  defaultAnchorDate,
}: {
  anchorKind: PlaybookAnchor;
  anchorId: string | null;
  defaultAnchorDate?: string;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [tasks, setTasks] = useState<PlaybookTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  /**
   * IDs of playbook tasks the agent has ticked for "Add to Tasks
   * List". Distinct from the completion checkbox so an agent can
   * line up several rows and bulk-promote them to /dashboard/tasks
   * without losing their place in the playbook.
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingToTasks, setAddingToTasks] = useState(false);
  const [addToTasksError, setAddToTasksError] = useState<string | null>(null);
  const [addToTasksMessage, setAddToTasksMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        anchorKind,
        anchorId: anchorId ?? "null",
      });
      const res = await fetch(`/api/dashboard/playbooks?${params.toString()}`);
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        tasks?: PlaybookTaskRow[];
        error?: string;
      } | null;
      if (!res.ok || !body?.ok || !Array.isArray(body.tasks)) {
        setError(body?.error ?? "Failed to load tasks.");
        return;
      }
      setTasks(body.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [anchorKind, anchorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleTask(task: PlaybookTaskRow, completed: boolean) {
    // Optimistic
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, completed_at: completed ? new Date().toISOString() : null }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/dashboard/playbooks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch {
      // Rollback on failure
      await load();
    }
  }

  async function deleteBatch(batchId: string) {
    if (!confirm("Remove every task in this playbook?")) return;
    await fetch(`/api/dashboard/playbooks/batch/${batchId}`, { method: "DELETE" });
    await load();
  }

  function toggleSelected(taskId: string) {
    setAddToTasksMessage(null);
    setAddToTasksError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  /**
   * Promote each selected playbook task into the agent's main
   * /dashboard/tasks list. Sequential POSTs (small N, no bulk
   * endpoint) — Promise.allSettled so a single failure doesn't
   * block the rest. After success the selection clears.
   */
  async function addSelectedToTasksList() {
    if (selectedIds.size === 0 || addingToTasks) return;
    setAddingToTasks(true);
    setAddToTasksError(null);
    setAddToTasksMessage(null);

    const ids = Array.from(selectedIds);
    const targets = tasks.filter((t) => ids.includes(t.id));

    const results = await Promise.allSettled(
      targets.map(async (t) => {
        const res = await fetch("/api/dashboard/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: t.title,
            description: t.notes ?? null,
            // Playbook due_date is YYYY-MM-DD; convert to noon UTC
            // so the agent's local timezone doesn't bump the date.
            dueAt: t.due_date ? `${t.due_date}T12:00:00.000Z` : null,
            priority: "medium",
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return t.id;
      }),
    );

    const succeeded: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      const t = targets[i];
      if (r.status === "fulfilled") succeeded.push(t.id);
      else failed.push(t.title);
    });

    setAddingToTasks(false);

    if (succeeded.length > 0) {
      setAddToTasksMessage(
        `Added ${succeeded.length} task${succeeded.length === 1 ? "" : "s"} to your Tasks list.`,
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of succeeded) next.delete(id);
        return next;
      });
    }
    if (failed.length > 0) {
      setAddToTasksError(
        `Couldn't add ${failed.length} task${failed.length === 1 ? "" : "s"}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`,
      );
    }
  }

  const { batches, open, done } = useMemo(() => groupTasks(tasks), [tasks]);

  if (loading && !tasks.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">📋 Playbooks</h2>
        <p className="mt-2 text-xs text-slate-500">{t("pages.playbooksPanel.loadingTasks")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">📋 Playbooks</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.playbooksPanel.intro")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void addSelectedToTasksList()}
            disabled={selectedIds.size === 0 || addingToTasks}
            title={
              selectedIds.size === 0
                ? "Tick the box on any open playbook item to enable"
                : `Add ${selectedIds.size} selected task${selectedIds.size === 1 ? "" : "s"} to your Tasks list`
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
          >
            {addingToTasks
              ? t("common:status.adding")
              : `+ Add to Tasks List${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
          {open > 0 ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
              {t("pages.playbooksPanel.openCount", { count: open })}
            </span>
          ) : null}
          {done > 0 ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              {t("pages.playbooksPanel.doneCount", { count: done })}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Apply playbook
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : null}
      {addToTasksMessage ? (
        <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
          {addToTasksMessage}{" "}
          <a
            href="/dashboard/tasks"
            className="font-semibold underline hover:text-green-900"
          >
            {t("pages.playbooksPanel.viewTasksList")}
          </a>
        </div>
      ) : null}
      {addToTasksError ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {addToTasksError}
        </div>
      ) : null}

      {batches.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("pages.playbooksPanel.empty")}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {batches.map((batch) => (
            <div
              key={batch.batchId ?? "ad-hoc"}
              className="rounded-lg border border-slate-200"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-700">
                  {batch.label}
                  <span className="ml-2 font-normal text-slate-500">
                    {t("pages.playbooksPanel.batchDone", { done: batch.done, total: batch.total })}
                  </span>
                </div>
                {batch.batchId ? (
                  <button
                    type="button"
                    onClick={() => void deleteBatch(batch.batchId!)}
                    className="text-[11px] text-slate-500 hover:text-red-600"
                  >{t("pages.playbooksPanel.remove")}</button>
                ) : null}
              </div>
              <div className="divide-y divide-slate-100">
                {batch.sections.map((section) => (
                  <div key={section.label} className="px-3 py-2">
                    {section.label !== "__none__" ? (
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {section.label}
                      </div>
                    ) : null}
                    <ul className="space-y-1">
                      {section.items.map((task) => {
                        const complete = task.completed_at != null;
                        const isSelected = selectedIds.has(task.id);
                        return (
                          <li key={task.id} className="flex items-start gap-2">
                            <div className="mt-0.5 inline-flex shrink-0 items-center gap-0.5">
                              {/*
                                "Add to Tasks list" — toggle selection
                                for the bulk header button. Hidden once
                                complete (no point promoting a done item).
                              */}
                              {complete ? (
                                <span aria-hidden className="inline-block h-6 w-6" />
                              ) : (
                                <PlaybookActionButton
                                  active={isSelected}
                                  onClick={() => toggleSelected(task.id)}
                                  title={
                                    isSelected
                                      ? "Remove from Tasks list selection"
                                      : "Select to add to Tasks list"
                                  }
                                  ariaLabel={`Select "${task.title}" to add to Tasks list`}
                                  tone="select"
                                >
                                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                                </PlaybookActionButton>
                              )}
                              <PlaybookActionButton
                                active={complete}
                                onClick={() => void toggleTask(task, !complete)}
                                title={complete ? "Mark incomplete" : "Mark complete"}
                                ariaLabel={`Mark "${task.title}" ${complete ? "incomplete" : "complete"}`}
                                tone="complete"
                              >
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                              </PlaybookActionButton>
                            </div>
                            <div className="flex-1">
                              <div
                                className={`text-sm ${
                                  complete
                                    ? "text-slate-400 line-through"
                                    : "text-slate-900"
                                }`}
                              >
                                {task.title}
                              </div>
                              {task.notes ? (
                                <div className="text-[11px] text-slate-500">{task.notes}</div>
                              ) : null}
                              {task.due_date ? (
                                <div
                                  className={`mt-0.5 text-[11px] ${
                                    !complete && isOverdue(task.due_date)
                                      ? "font-medium text-red-600"
                                      : "text-slate-400"
                                  }`}
                                >{t("pages.dashFragments.dueOn", { date: formatYmd(task.due_date, locale) })}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPicker ? (
        <PlaybookPickerModal
          anchorKind={anchorKind}
          anchorId={anchorId}
          defaultAnchorDate={defaultAnchorDate}
          onClose={() => setShowPicker(false)}
          onApplied={(count, title) => {
            setShowPicker(false);
            setAddToTasksMessage(
              count === 1
                ? `Added 1 task from "${title}".`
                : `Added ${count} tasks from "${title}".`,
            );
            // Clear the success banner after a few seconds — non-blocking.
            window.setTimeout(() => setAddToTasksMessage(null), 5000);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Two-stage modal:
 *   1. `pick`   — pick a playbook from the available catalog. Bottom
 *                 button reads "Review tasks →" once one is selected.
 *   2. `review` — show the picked playbook's items with checkboxes
 *                 (all checked by default), the anchor date, and a
 *                 final "Apply N tasks" button. Deselected items are
 *                 sent as `skipIndexes` so they're not created.
 *
 * On success the parent's `onApplied(count, title)` runs so the
 * PlaybooksPanel can show a non-blocking confirmation banner.
 */
export function PlaybookPickerModal({
  anchorKind,
  anchorId,
  defaultAnchorDate,
  leads,
  onClose,
  onApplied,
}: {
  anchorKind: PlaybookAnchor;
  anchorId: string | null;
  defaultAnchorDate?: string;
  /**
   * If provided, the picker also lists playbooks that don't accept the
   * parent's `anchorKind` but do accept "contact" — and the review step
   * shows a contact dropdown so the agent picks the lead. Used on the
   * standalone /dashboard/playbooks page where `anchorKind="generic"`
   * but lead-bound playbooks (write_offer, seller_presentation,
   * listing_launch) should still be applicable.
   */
  leads?: Array<{ id: string; name: string | null }>;
  onClose: () => void;
  onApplied: (createdCount: number, title: string) => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [playbooks, setPlaybooks] = useState<PlaybookMeta[]>([]);
  const [stage, setStage] = useState<"pick" | "review">("pick");
  const [selected, setSelected] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState<string>(
    defaultAnchorDate ?? todayYmd(),
  );
  /**
   * Contact picked in the review step when the selected playbook needs
   * a contact (i.e. doesn't accept the parent's anchorKind). Empty
   * string until the agent picks one.
   */
  const [pickedContactId, setPickedContactId] = useState<string>("");
  /** Indexes of items the agent unchecked in the review step. */
  const [skipIndexes, setSkipIndexes] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The page passing a `leads` array (even an empty one) signals that
  // the picker should also surface contact-anchor playbooks — the user
  // is on the standalone /dashboard/playbooks page where those are
  // applicable. Previously we gated this on `leads.length > 0`, which
  // meant a fresh agent with zero contacts saw "No playbooks available"
  // even though every contact-anchor playbook is technically pickable
  // (we just need to send them to /contacts to create one first).
  const contactPickerEnabled = Array.isArray(leads);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/dashboard/playbooks");
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        playbooks?: PlaybookMeta[];
      } | null;
      if (!cancelled && body?.ok && Array.isArray(body.playbooks)) {
        setPlaybooks(
          body.playbooks.filter(
            (p) =>
              p.validAnchors.includes(anchorKind) ||
              (contactPickerEnabled && p.validAnchors.includes("contact")),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorKind, contactPickerEnabled]);

  const selectedPlaybook = playbooks.find((p) => p.key === selected) ?? null;
  const includedCount =
    selectedPlaybook != null
      ? selectedPlaybook.items.length - skipIndexes.size
      : 0;
  /**
   * Determines whether the selected playbook needs a contact pick at
   * apply-time. True iff the playbook doesn't accept the parent's
   * `anchorKind` (so we'd otherwise be applying it to a kind it
   * doesn't support — fall back to "contact").
   */
  const needsContact =
    selectedPlaybook != null && !selectedPlaybook.validAnchors.includes(anchorKind);

  function goToReview() {
    if (!selected) return;
    // Reset skip state when entering review (e.g. after re-picking).
    setSkipIndexes(new Set());
    setPickedContactId("");
    setError(null);
    setStage("review");
  }

  function toggleItem(idx: number) {
    setSkipIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function apply() {
    if (!selectedPlaybook) return;
    if (includedCount === 0) {
      setError("Pick at least one task to apply.");
      return;
    }
    if (needsContact && !pickedContactId) {
      setError("Pick a contact for this playbook.");
      return;
    }
    setError(null);
    setApplying(true);
    try {
      const effectiveAnchorKind: PlaybookAnchor = needsContact ? "contact" : anchorKind;
      const effectiveAnchorId = needsContact ? pickedContactId : anchorId;
      const res = await fetch("/api/dashboard/playbooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateKey: selectedPlaybook.key,
          anchorKind: effectiveAnchorKind,
          anchorId: effectiveAnchorId,
          anchorDate,
          skipIndexes: Array.from(skipIndexes),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Failed to apply.");
        return;
      }
      onApplied(includedCount, selectedPlaybook.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {stage === "pick" ? t("pages.playbooks.applyPlaybook") : selectedPlaybook?.title ?? t("pages.playbooks.reviewTasks")}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {stage === "pick"
                ? t("pages.playbooks.pickACuratedChecklist")
                : t("pages.playbooks.untickAnythingYouDon")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label={t("pages.playbooksPanel.close")}
          >
            ✕
          </button>
        </div>

        {stage === "pick" ? (
          <div className="mt-4 grid max-h-[400px] gap-2 overflow-y-auto">
            {playbooks.length === 0 ? (
              <p className="text-sm text-slate-500">{t("pages.playbooksPanel.noneForAnchor")}</p>
            ) : (
              playbooks.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelected(p.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selected === p.key
                      ? "border-slate-900 bg-slate-900/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {t("pages.playbooksPanel.taskCount", { count: p.itemCount })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{p.description}</p>
                </button>
              ))
            )}
          </div>
        ) : selectedPlaybook ? (
          <ReviewStep
            playbook={selectedPlaybook}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            skipIndexes={skipIndexes}
            onToggleItem={toggleItem}
            contactPicker={
              needsContact && leads
                ? {
                    leads,
                    pickedId: pickedContactId,
                    onPick: setPickedContactId,
                  }
                : null
            }
          />
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          {stage === "review" ? (
            <button
              type="button"
              onClick={() => setStage("pick")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >{t("pages.playbooksPanel.cancel")}</button>
          )}
          {stage === "pick" ? (
            <button
              type="button"
              onClick={goToReview}
              disabled={!selected}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t("pages.playbooksPanel.reviewTasks")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void apply()}
              disabled={includedCount === 0 || applying || (needsContact && !pickedContactId)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {applying
                ? t("common:status.applying")
                : `Apply ${includedCount} task${includedCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Review-stage body. Renders a checkbox per playbook item grouped by
 * section (when the playbook author tagged sections), plus the anchor
 * date input. All items default to checked; agents untick to exclude.
 */
function ReviewStep({
  playbook,
  anchorDate,
  onAnchorDateChange,
  skipIndexes,
  onToggleItem,
  contactPicker,
}: {
  playbook: PlaybookMeta;
  anchorDate: string;
  onAnchorDateChange: (next: string) => void;
  skipIndexes: Set<number>;
  onToggleItem: (idx: number) => void;
  /** Non-null when the playbook needs a contact and the parent supplied a list. */
  contactPicker: {
    leads: Array<{ id: string; name: string | null }>;
    pickedId: string;
    onPick: (id: string) => void;
  } | null;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const grouped = useMemo(() => {
    const out = new Map<string, Array<{ item: PlaybookItemMeta; idx: number }>>();
    playbook.items.forEach((item, idx) => {
      const key = item.section ?? "";
      const list = out.get(key) ?? [];
      list.push({ item, idx });
      out.set(key, list);
    });
    return Array.from(out.entries()); // [section, items[]]
  }, [playbook]);

  return (
    <div className="mt-4 space-y-4">
      {contactPicker ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <label className="block text-xs font-medium text-amber-900">
            Contact (lead) *
          </label>
          <p className="mt-0.5 text-[11px] text-amber-800">{t("pages.playbooksPanel.leadBound")}</p>
          {contactPicker.leads.length === 0 ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">{t("pages.dashFragments.noContactsYet")}{" "}
              <a
                href="/dashboard/contacts"
                className="font-semibold underline hover:text-amber-700"
              >
                {t("pages.playbooksPanel.addAContact")}
              </a>{" "}{t("pages.dashFragments.thenComeBack")}</div>
          ) : (
            <select
              value={contactPicker.pickedId}
              onChange={(e) => contactPicker.onPick(e.target.value)}
              className="mt-2 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t("pages.playbooksPanel.selectAContact")}</option>
              {contactPicker.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name ?? `Contact #${l.id}`}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}
      <div className="rounded-lg bg-slate-50 p-3">
        <label className="block text-xs font-medium text-slate-700">
          {playbook.anchorHint} *
        </label>
        <input
          type="date"
          value={anchorDate}
          onChange={(e) => onAnchorDateChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-200">
        {grouped.map(([section, items], gi) => (
          <div key={`${section}-${gi}`}>
            {section ? (
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {section}
              </div>
            ) : null}
            <ul className="divide-y divide-slate-100">
              {items.map(({ item, idx }) => {
                const checked = !skipIndexes.has(idx);
                return (
                  <li key={idx}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleItem(idx)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm leading-tight ${checked ? "text-slate-900" : "text-slate-400 line-through"}`}>
                          {item.title}
                        </div>
                        {item.notes ? (
                          <p className={`mt-0.5 text-[11px] leading-snug ${checked ? "text-slate-500" : "text-slate-400"}`}>
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                        {formatOffset(item.offsetDays)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Square icon-only toggle button used for the per-row playbook actions
 * (add-to-tasks selection + mark-complete). `active` flips the button to
 * a filled state so the agent can read the current value at a glance —
 * blue ring when selected for promotion, emerald fill when completed.
 */
export function PlaybookActionButton({
  children,
  onClick,
  title,
  ariaLabel,
  active,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  active: boolean;
  tone: "select" | "complete";
}) {
  const toneClasses =
    tone === "complete"
      ? active
        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
        : "border-slate-300 bg-white text-slate-400 hover:border-emerald-500 hover:text-emerald-600"
      : active
        ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
        : "border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-700";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${toneClasses}`}
    >
      {children}
    </button>
  );
}

/** "+3d", "today", "−7d" — compact label for the offset column. */
function formatOffset(days: number): string {
  if (days === 0) return "today";
  if (days > 0) return `+${days}d`;
  return `${days}d`;
}

// ── Helpers ───────────────────────────────────────────────────────────

type GroupedBatch = {
  batchId: string | null;
  label: string;
  total: number;
  done: number;
  sections: Array<{ label: string; items: PlaybookTaskRow[] }>;
};

function groupTasks(tasks: PlaybookTaskRow[]): {
  batches: GroupedBatch[];
  open: number;
  done: number;
} {
  let openCount = 0;
  let doneCount = 0;
  for (const t of tasks) {
    if (t.completed_at) doneCount++;
    else openCount++;
  }

  // Group by batch, then by section within each batch
  const byBatch = new Map<string, PlaybookTaskRow[]>();
  for (const t of tasks) {
    const k = t.apply_batch_id ?? "ad-hoc";
    const list = byBatch.get(k) ?? [];
    list.push(t);
    byBatch.set(k, list);
  }

  const batches: GroupedBatch[] = [];
  byBatch.forEach((items, key) => {
    const first = items[0];
    const sections = new Map<string, PlaybookTaskRow[]>();
    for (const it of items) {
      const sec = it.section ?? "__none__";
      const list = sections.get(sec) ?? [];
      list.push(it);
      sections.set(sec, list);
    }
    const total = items.length;
    const done = items.filter((x) => x.completed_at).length;
    batches.push({
      batchId: first.apply_batch_id,
      label: labelFor(first.template_key),
      total,
      done,
      sections: Array.from(sections.entries()).map(([label, items]) => ({ label, items })),
    });
    void key;
  });
  // Most-recent batch first (by first task created_at)
  batches.sort((a, b) => {
    const ta = a.sections[0]?.items[0]?.created_at ?? "";
    const tb = b.sections[0]?.items[0]?.created_at ?? "";
    return tb.localeCompare(ta);
  });
  return { batches, open: openCount, done: doneCount };
}

function labelFor(templateKey: string | null): string {
  if (!templateKey) return "Ad-hoc tasks";
  return getPlaybook(templateKey)?.title ?? templateKey;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatYmd(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function isOverdue(ymd: string): boolean {
  return ymd < todayYmd();
}

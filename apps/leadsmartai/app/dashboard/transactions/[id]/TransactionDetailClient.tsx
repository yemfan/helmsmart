"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DealReviewPanel } from "@/components/dashboard/DealReviewPanel";
import { ListingFeedbackPanel } from "@/components/dashboard/ListingFeedbackPanel";
import PostToFacebookCard from "@/components/dashboard/PostToFacebookCard";
import { PlaybooksPanel } from "@/components/dashboard/PlaybooksPanel";
import { LimitWarningBanner } from "@/components/entitlements/LimitWarningBanner";
import { TransactionTypeBadge } from "@/components/transactions/TransactionAtoms";
import { TransactionHealthBanner } from "@/components/realtyboss/TransactionHealthBanner";
import type {
  CounterpartyRole,
  TransactionCounterpartyRow,
  TransactionRow,
  TransactionStage,
  TransactionTaskRow,
} from "@/lib/transactions/types";

type Bundle = {
  transaction: TransactionRow;
  tasks: TransactionTaskRow[];
  counterparties: TransactionCounterpartyRow[];
  contactName: string | null;
};

const STAGE_ORDER: TransactionStage[] = ["contract", "inspection", "appraisal", "loan", "closing"];

const COUNTERPARTY_ROLES: CounterpartyRole[] = [
  "title",
  "lender",
  "inspector",
  "insurance",
  "co_agent",
  "other",
];

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function TransactionDetailClient({ initial }: { initial: Bundle }) {
  const { t } = useTranslation("dashboard");
  const [txn, setTxn] = useState<TransactionRow>(initial.transaction);
  const [tasks, setTasks] = useState<TransactionTaskRow[]>(initial.tasks);
  const [cps, setCps] = useState<TransactionCounterpartyRow[]>(initial.counterparties);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tasksByStage = useMemo(() => {
    const out = new Map<TransactionStage, TransactionTaskRow[]>();
    for (const s of STAGE_ORDER) out.set(s, []);
    for (const t of tasks) {
      const arr = out.get(t.stage) ?? [];
      arr.push(t);
      out.set(t.stage, arr);
    }
    return out;
  }, [tasks]);

  /**
   * Per-stage roll-up — feeds both the sticky pipeline stepper at the
   * top of the left column AND each StageBlock's collapsed-by-default
   * heuristic (a stage is "done" when it has tasks AND every task is
   * completed). Empty stages are NOT considered done — they collapse
   * by default but the pill renders muted to signal "nothing here yet"
   * rather than "all clear".
   */
  const stageMetrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const out = {} as Record<
      TransactionStage,
      { total: number; completed: number; overdue: number; isComplete: boolean; isEmpty: boolean }
    >;
    for (const s of STAGE_ORDER) {
      const stageTasks = tasksByStage.get(s) ?? [];
      let completed = 0;
      let overdue = 0;
      for (const t of stageTasks) {
        if (t.completed_at) {
          completed += 1;
        } else if (t.due_date && t.due_date < today) {
          overdue += 1;
        }
      }
      out[s] = {
        total: stageTasks.length,
        completed,
        overdue,
        isComplete: stageTasks.length > 0 && completed === stageTasks.length,
        isEmpty: stageTasks.length === 0,
      };
    }
    return out;
  }, [tasksByStage]);

  /**
   * Per-stage open/closed state. `undefined` means "use the default":
   * closed if the stage is complete OR empty, open otherwise. Once the
   * agent toggles a stage manually, that override sticks until they
   * navigate away — we don't auto-collapse a stage they explicitly
   * opened just because they happened to complete its last task.
   */
  const [stageOverrides, setStageOverrides] = useState<
    Partial<Record<TransactionStage, boolean>>
  >({});

  const isStageOpen = useCallback(
    (stage: TransactionStage): boolean => {
      const override = stageOverrides[stage];
      if (override !== undefined) return override;
      const m = stageMetrics[stage];
      return !(m.isComplete || m.isEmpty);
    },
    [stageMetrics, stageOverrides],
  );

  const toggleStage = useCallback((stage: TransactionStage) => {
    setStageOverrides((prev) => {
      // If currently using the default, capture it explicitly so we
      // can flip it. After this point the override sticks.
      const next = { ...prev };
      const m = stageMetrics[stage];
      const currentlyOpen =
        prev[stage] !== undefined ? prev[stage]! : !(m.isComplete || m.isEmpty);
      next[stage] = !currentlyOpen;
      return next;
    });
  }, [stageMetrics]);

  /**
   * Pill click → open the target stage AND scroll its section into
   * view. `requestAnimationFrame` waits one frame so the layout
   * settles after the open-state change before we measure / scroll;
   * otherwise a previously-collapsed stage's anchor is at the wrong
   * y-offset and we land in the wrong spot.
   */
  const focusStage = useCallback((stage: TransactionStage) => {
    setStageOverrides((prev) => ({ ...prev, [stage]: true }));
    requestAnimationFrame(() => {
      document
        .getElementById(`stage-${stage}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let completed = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.completed_at) completed += 1;
      else if (t.due_date && t.due_date < today) overdue += 1;
    }
    return { completed, total: tasks.length, overdue };
  }, [tasks]);

  async function patchTransaction(patch: Record<string, unknown>, fieldKey: string) {
    setSavingField(fieldKey);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/transactions/${txn.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transaction?: TransactionRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.transaction) {
        setError(body.error ?? t("detail.transaction.saveFailed"));
        return;
      }
      setTxn(body.transaction);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.transaction.networkError"));
    } finally {
      setSavingField(null);
    }
  }

  async function toggleTask(t: TransactionTaskRow) {
    const res = await fetch(`/api/dashboard/transactions/${txn.id}/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: !t.completed_at }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; task?: TransactionTaskRow };
    if (res.ok && body.ok && body.task) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? body.task! : x)));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs text-slate-500">
            <Link href="/dashboard/transactions" className="hover:underline">{t("pages.transactionDetail.transactions")}</Link>
            {" / "}
            <span>{txn.property_address}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{txn.property_address}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{initial.contactName ?? "—"}</span>
            {txn.purchase_price ? (
              <>
                <span aria-hidden>·</span>
                <span>${txn.purchase_price.toLocaleString()}</span>
              </>
            ) : null}
            <TransactionTypeBadge type={txn.transaction_type} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{t("pages.transactionDetail.daysToClose")}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {(() => {
                const d = daysUntil(txn.closing_date);
                if (d == null) return "—";
                if (d < 0) return `${-d}d past`;
                return `${d}d`;
              })()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{t("detail.transaction.tasks")}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {totals.completed}/{totals.total}
            </div>
            {totals.overdue > 0 ? (
              <div className="mt-0.5 text-[11px] font-medium text-red-600">
                {totals.overdue} overdue
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* CloseBoss: lead with health, not data — what's happening,
          what's next, what's missing, what's at risk. */}
      <TransactionHealthBanner
        input={{
          status: txn.status,
          inspection_deadline: txn.inspection_deadline,
          inspection_completed_at: txn.inspection_completed_at,
          appraisal_deadline: txn.appraisal_deadline,
          appraisal_completed_at: txn.appraisal_completed_at,
          loan_contingency_deadline: txn.loan_contingency_deadline,
          loan_contingency_removed_at: txn.loan_contingency_removed_at,
          closing_date: txn.closing_date,
          task_total: totals.total,
          task_completed: totals.completed,
          task_overdue: totals.overdue,
        }}
      />

      {/* Listing-side surfaces: compact horizontal strip rather than the
          previous 3-column card grid. Same items (offers, weekly seller
          update, presentation builder) but the strip frees ~150px of
          vertical real estate above the main content. PostToFacebook
          and ListingFeedback stay as full sections below — they're UI
          components, not nav links. Buyer-rep deals skip the strip. */}
      {txn.transaction_type === "listing_rep" || txn.transaction_type === "dual" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.transactionDetail.listingTools")}</span>
          <Link
            href={`/dashboard/transactions/${txn.id}/offers`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100"
            title={t("tips.compareOffers")}
          >
            📬 Offers
          </Link>
          <Link
            href="/dashboard/seller-presentation"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100"
            title={t("tips.openCma")}
          >
            🎯 Presentation
          </Link>
          <SellerUpdateInlineToggle
            transaction={txn}
            onChange={(enabled) =>
              setTxn((prev) => ({ ...prev, seller_update_enabled: enabled } as TransactionRow))
            }
          />
        </div>
      ) : null}

      {/* Listing-side social posting — push to a connected Facebook Page
          with one click. v1 manual-trigger only; auto-on-active is a
          follow-up. */}
      {txn.transaction_type === "listing_rep" || txn.transaction_type === "dual" ? (
        <PostToFacebookCard transactionId={txn.id} />
      ) : null}

      {/* Cross-agent showing feedback — listing-side only. Agent sends a
          public form to buyer-agents who toured; responses aggregate here. */}
      {txn.transaction_type === "listing_rep" || txn.transaction_type === "dual" ? (
        <ListingFeedbackPanel transactionId={txn.id} />
      ) : null}

      {/* Playbooks — agent-applied curated checklists anchored to this
          transaction. Anchor date defaults to mutual acceptance when
          set, else today. */}
      <PlaybooksPanel
        anchorKind="transaction"
        anchorId={txn.id}
        defaultAnchorDate={txn.mutual_acceptance_date ?? undefined}
      />

      {/* AI deal review — only makes sense once the deal is closed.
          Wrapped in a collapsible expander so it doesn't dominate the
          top of the detail page on closed deals; the dates / tasks /
          counterparties are still the primary content. Open by default
          when the deal is freshly closed (no override yet) — once the
          agent collapses it the choice persists for the session. */}
      {txn.status === "closed" ? (
        <PostCloseReviewExpander>
          <div className="space-y-3">
            <LimitWarningBanner action="ai_action" />
            <DealReviewPanel transactionId={txn.id} />
          </div>
        </PostCloseReviewExpander>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Left column — sticky stage pipeline + tasks by stage ── */}
        <div className="space-y-4">
          <StagePipeline metrics={stageMetrics} onStageClick={focusStage} />
          {STAGE_ORDER.map((stage) => {
            const stageTasks = tasksByStage.get(stage) ?? [];
            return (
              <StageBlock
                key={stage}
                stage={stage}
                tasks={stageTasks}
                transactionId={txn.id}
                open={isStageOpen(stage)}
                onToggleOpen={() => toggleStage(stage)}
                onToggle={toggleTask}
                onAdd={(task) => setTasks((prev) => [...prev, task])}
                onDelete={(id) => setTasks((prev) => prev.filter((x) => x.id !== id))}
              />
            );
          })}
        </div>

        {/* ── Right column — Dates / People / Notes tabs ──
            Replaces the previous always-stacked sections. The same
            content is now reachable via tab clicks; default tab is
            Dates because that's the most-touched surface (deadlines
            move, contingencies extend). Persisted to localStorage so
            an agent who lives on the People tab doesn't have to
            re-click every visit. */}
        <aside>
          <RightRailTabs
            txn={txn}
            cps={cps}
            savingField={savingField}
            patchTransaction={patchTransaction}
            onCpAdd={(cp) => setCps((prev) => [...prev, cp])}
            onCpDelete={(id) => setCps((prev) => prev.filter((x) => x.id !== id))}
          />
        </aside>
      </div>
    </div>
  );
}

function DateRow({
  label,
  value,
  onChange,
  saving,
  help,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  saving: boolean;
  help?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-600">{label}</label>
        {saving ? <span className="text-[10px] text-slate-400">saving…</span> : null}
      </div>
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft || null;
          if (v !== value) onChange(v);
        }}
        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      {help ? <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{help}</p> : null}
    </div>
  );
}

function StageBlock({
  stage,
  tasks,
  transactionId,
  open,
  onToggleOpen,
  onToggle,
  onAdd,
  onDelete,
}: {
  stage: TransactionStage;
  tasks: TransactionTaskRow[];
  transactionId: string;
  /** Controlled by parent so the sticky pipeline stepper can force a
   *  closed stage open when the agent clicks its pill. */
  open: boolean;
  onToggleOpen: () => void;
  onToggle: (t: TransactionTaskRow) => void;
  onAdd: (t: TransactionTaskRow) => void;
  onDelete: (id: string) => void;
}) {
  // Named `tr` — the task rows in this block bind `t` to a TransactionTaskRow.
  const { t: tr } = useTranslation("dashboard");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const stageCompleted = tasks.filter((t) => t.completed_at).length;
  const allDone = tasks.length > 0 && stageCompleted === tasks.length;

  async function submitAdd() {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/dashboard/transactions/${transactionId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, title: newTitle, due_date: newDue || null }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; task?: TransactionTaskRow };
    if (res.ok && body.ok && body.task) {
      onAdd(body.task);
      setAdding(false);
      setNewTitle("");
      setNewDue("");
    }
  }

  /**
   * `scroll-margin-top` keeps the stage header visible below the
   * sticky StagePipeline strip when the agent clicks a pill — without
   * it, the section's top edge lands right under the strip and the
   * heading is hidden. 64px = the strip's vertical footprint with
   * comfortable breathing room above it.
   */
  return (
    <section
      id={`stage-${stage}`}
      className="scroll-mt-16 rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls={`stage-body-${stage}`}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-slate-50/60"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ChevronGlyph open={open} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              {tr(`detail.transaction.stage.${stage}`)}
              {allDone ? (
                <span className="ml-2 align-middle text-[10px] font-medium text-emerald-700">
                  ✓ done
                </span>
              ) : null}
            </span>
            <span className="block text-[11px] text-slate-500">
              {stageCompleted}/{tasks.length} complete
            </span>
          </span>
        </span>
      </button>

      {open ? (
        <div id={`stage-body-${stage}`} className="border-t border-slate-100">
          <div className="flex items-center justify-end px-5 py-2">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {adding ? tr("detail.transaction.cancel") : "+ Add task"}
            </button>
          </div>

          {adding ? (
            <div className="border-y border-slate-100 bg-slate-50/50 px-5 py-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={tr("detail.transaction.taskTitle")}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                autoFocus
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void submitAdd()}
                  disabled={!newTitle.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >{tr("pages.transactionDetail.add")}</button>
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-slate-100">
            {tasks.length === 0 ? (
              <li className="px-5 py-4 text-xs text-slate-500">{tr("detail.transaction.noTasksInStage")}</li>
            ) : (
              tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-2.5">
                  <input
                    type="checkbox"
                    checked={Boolean(t.completed_at)}
                    onChange={() => onToggle(t)}
                    className="mt-0.5 h-4 w-4 accent-slate-900"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`text-sm ${t.completed_at ? "text-slate-400 line-through" : "text-slate-800"}`}
                      >
                        {t.title}
                        {t.seed_key === "verify_wire_instructions" ? (
                          <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            anti-fraud
                          </span>
                        ) : null}
                      </div>
                      <TaskDueBadge dueDate={t.due_date} completed={Boolean(t.completed_at)} />
                    </div>
                    {t.description ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        {t.description}
                      </p>
                    ) : null}
                  </div>
                  {t.source === "custom" ? (
                    <button
                      type="button"
                      title={tr("detail.transaction.deleteCustomTask")}
                      onClick={async () => {
                        if (!confirm(tr("detail.transaction.confirmDeleteTask"))) return;
                        const res = await fetch(
                          `/api/dashboard/transactions/${transactionId}/tasks/${t.id}`,
                          { method: "DELETE" },
                        );
                        if (res.ok) onDelete(t.id);
                      }}
                      className="text-[10px] text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Inline chevron — rotates 90° between collapsed (▶) and expanded (▼)
 * states. Inlined instead of pulling in `lucide-react` so the
 * transaction-detail bundle doesn't grow for one tiny glyph.
 */
function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Sticky stage stepper at the top of the left column. One pill per
 * stage with completion + overdue counts. Clicking a pill calls
 * `onStageClick(stage)` — the parent handles both opening that stage
 * (in case it was collapsed because all tasks were done) and
 * smooth-scrolling to its anchor below.
 *
 * Pill tones encode state at a glance:
 *   emerald — every task in the stage is complete
 *   rose    — at least one task is overdue
 *   blue    — in progress (some completed but not all)
 *   slate   — no tasks yet, or all tasks open and on time
 *
 * Sticky positioning means it stays visible while the agent scrolls
 * through long pipelines — same affordance as a wizard stepper.
 */
function StagePipeline({
  metrics,
  onStageClick,
}: {
  metrics: Record<
    TransactionStage,
    { total: number; completed: number; overdue: number; isComplete: boolean; isEmpty: boolean }
  >;
  onStageClick: (stage: TransactionStage) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/90 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {STAGE_ORDER.map((stage, idx) => {
          const m = metrics[stage];
          const tone =
            m.overdue > 0
              ? "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100"
              : m.isComplete
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                : m.completed > 0
                  ? "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onStageClick(stage)}
              title={t(
                m.overdue > 0 ? "detail.transaction.jumpToOverdue" : "detail.transaction.jumpTo",
                {
                  stage: t(`detail.transaction.stage.${stage}`),
                  completed: m.completed,
                  total: m.total,
                  overdue: m.overdue,
                },
              )}
              className={`group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left transition ${tone}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold tabular-nums">
                  {idx + 1}
                </span>
                <span className="min-w-0 truncate text-xs font-semibold">
                  {t(`detail.transaction.stage.${stage}`)}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-80">
                {m.isComplete ? "✓" : m.isEmpty ? "—" : `${m.completed}/${m.total}`}
                {m.overdue > 0 ? (
                  <span className="ml-1 rounded-full bg-rose-200/70 px-1 text-rose-900">
                    !{m.overdue}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskDueBadge({ dueDate, completed }: { dueDate: string | null; completed: boolean }) {
  const { t } = useTranslation("dashboard");
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  if (d == null) return null;

  if (completed) {
    return <span className="text-[10px] text-slate-400">{dueDate}</span>;
  }
  if (d < 0) {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
        {-d}{t("pages.dashFragments.dOverdue")}</span>
    );
  }
  if (d <= 3) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        {d === 0 ? "today" : `${d}d`}
      </span>
    );
  }
  return <span className="text-[10px] text-slate-400">{dueDate}</span>;
}

/**
 * Body content for the Counterparties tab in the right rail. Renders
 * the add-form and the list, but no outer card wrapper — the tab pane
 * provides that. Was previously its own `<section>` block before the
 * right rail moved to tabs.
 */
function CounterpartiesBlockBody({
  transactionId,
  counterparties,
  onAdd,
  onDelete,
}: {
  transactionId: string;
  counterparties: TransactionCounterpartyRow[];
  onAdd: (cp: TransactionCounterpartyRow) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{
    role: CounterpartyRole;
    name: string;
    company: string;
    email: string;
    phone: string;
  }>({ role: "title", name: "", company: "", email: "", phone: "" });

  async function submit() {
    if (!form.name.trim()) return;
    const res = await fetch(`/api/dashboard/transactions/${transactionId}/counterparties`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      counterparty?: TransactionCounterpartyRow;
    };
    if (res.ok && body.ok && body.counterparty) {
      onAdd(body.counterparty);
      setAdding(false);
      setForm({ role: "title", name: "", company: "", email: "", phone: "" });
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t("detail.transaction.peopleBlurb")}</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {adding ? t("detail.transaction.cancel") : "+ Add"}
        </button>
      </header>

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as CounterpartyRole }))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {COUNTERPARTY_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`detail.transaction.counterparty.${r}`)}
              </option>
            ))}
          </select>
          <input
            placeholder={t("detail.transaction.name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            placeholder={t("detail.transaction.companyOptional")}
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            placeholder={t("detail.transaction.emailOptional")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            placeholder={t("detail.transaction.phoneOptional")}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!form.name.trim()}
            className="w-full rounded-lg bg-slate-900 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >{t("pages.transactionDetail.addCounterparty")}</button>
        </div>
      ) : null}

      {counterparties.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{t("pages.transactionDetail.counterpartyHint")}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {counterparties.map((cp) => (
            <li
              key={cp.id}
              className="group rounded-lg border border-slate-100 bg-slate-50/30 px-3 py-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {t(`detail.transaction.counterparty.${cp.role}`)}
                  </div>
                  <div className="font-medium text-slate-900">{cp.name}</div>
                  {cp.company ? <div className="text-xs text-slate-600">{cp.company}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Remove ${cp.name}?`)) return;
                    const res = await fetch(
                      `/api/dashboard/transactions/${transactionId}/counterparties/${cp.id}`,
                      { method: "DELETE" },
                    );
                    if (res.ok) onDelete(cp.id);
                  }}
                  className="invisible text-[10px] text-slate-400 hover:text-red-600 group-hover:visible"
                >
                  ✕
                </button>
              </div>
              {cp.email || cp.phone ? (
                <div className="mt-1 text-xs text-slate-600">
                  {cp.email ? (
                    <a href={`mailto:${cp.email}`} className="underline hover:text-slate-900">
                      {cp.email}
                    </a>
                  ) : null}
                  {cp.email && cp.phone ? " · " : null}
                  {cp.phone ? (
                    <a href={`tel:${cp.phone}`} className="underline hover:text-slate-900">
                      {cp.phone}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Compact inline toggle for the weekly seller-update email — used in
 * the listing-tools strip on the transaction detail page. Clicks PATCH
 * the transaction; the parent bubbles the new value via onChange.
 *
 * Replaces the previous standalone SellerUpdateToggle card; the strip
 * is the new home so listing tools fit in one row above the deal body.
 * strip. Shows a single label + switch in one row instead of the
 * full bordered card. Same patch endpoint, same disabled-while-saving
 * behavior.
 */
function SellerUpdateInlineToggle({
  transaction,
  onChange,
}: {
  transaction: TransactionRow;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [saving, setSaving] = useState(false);
  const enabled = transaction.seller_update_enabled;

  async function toggle() {
    setSaving(true);
    try {
      const next = !enabled;
      const res = await fetch(`/api/dashboard/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seller_update_enabled: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transaction?: TransactionRow;
      };
      if (res.ok && body.ok && body.transaction) {
        onChange(body.transaction.seller_update_enabled);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      role="switch"
      aria-checked={enabled}
      disabled={saving}
      title={
        enabled
          ? t("detail.transaction.weeklyUpdateOn")
          : t("detail.transaction.weeklyUpdateOff")
      }
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-medium transition disabled:opacity-50 ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
      }`}
    >
      <span aria-hidden>📧</span>
      <span>{t("pages.dashFragments.weeklyUpdate")} {enabled ? "on" : "off"}</span>
    </button>
  );
}

/**
 * Right-rail Dates / People / Notes tabs. The t("detail.transaction.tabs.dates") pane carries the
 * Status select since both deal with deal-level metadata that the
 * coordinator changes together. Active tab is persisted per-tab via
 * localStorage so an agent who lives on People doesn't have to re-click.
 */
function RightRailTabs({
  txn,
  cps,
  savingField,
  patchTransaction,
  onCpAdd,
  onCpDelete,
}: {
  txn: TransactionRow;
  cps: TransactionCounterpartyRow[];
  savingField: string | null;
  patchTransaction: (patch: Record<string, unknown>, fieldKey: string) => Promise<void>;
  onCpAdd: (cp: TransactionCounterpartyRow) => void;
  onCpDelete: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  type Tab = "dates" | "people" | "notes";
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "dates";
    try {
      const v = window.localStorage.getItem("leadsmart.txn.detail.right-tab");
      return v === "people" || v === "notes" ? v : "dates";
    } catch {
      return "dates";
    }
  });
  const setTabPersist = useCallback((next: Tab) => {
    setTab(next);
    try {
      window.localStorage.setItem("leadsmart.txn.detail.right-tab", next);
    } catch {
      // non-fatal
    }
  }, []);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "dates", label: t("detail.transaction.tabs.dates") },
    { key: "people", label: t("detail.transaction.tabs.people"), count: cps.length },
    { key: "notes", label: t("detail.transaction.tabs.notes") },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTabPersist(t.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
              {typeof t.count === "number" ? (
                <span className="ml-1 text-[10px] tabular-nums text-slate-400">{t.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {tab === "dates" ? (
          <div>
            <div className="space-y-2 text-sm">
              <DateRow
                label={t("detail.transaction.dates.mutualAcceptance")}
                value={txn.mutual_acceptance_date}
                onChange={(v) => patchTransaction({ mutual_acceptance_date: v }, "mutual")}
                saving={savingField === "mutual"}
                help="Setting this auto-fills contingency deadlines with CA defaults (17d inspection, 21d loan, 30d closing) unless already set."
              />
              <DateRow
                label={t("detail.transaction.dates.inspectionDeadline")}
                value={txn.inspection_deadline}
                onChange={(v) => patchTransaction({ inspection_deadline: v }, "inspection")}
                saving={savingField === "inspection"}
              />
              <DateRow
                label={t("detail.transaction.dates.appraisalDeadline")}
                value={txn.appraisal_deadline}
                onChange={(v) => patchTransaction({ appraisal_deadline: v }, "appraisal")}
                saving={savingField === "appraisal"}
              />
              <DateRow
                label={t("detail.transaction.dates.loanContingency")}
                value={txn.loan_contingency_deadline}
                onChange={(v) => patchTransaction({ loan_contingency_deadline: v }, "loan")}
                saving={savingField === "loan"}
              />
              <DateRow
                label={t("detail.transaction.dates.closingDate")}
                value={txn.closing_date}
                onChange={(v) => patchTransaction({ closing_date: v }, "closing")}
                saving={savingField === "closing"}
              />
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <label className="block text-[11px] font-medium text-slate-500">{t("detail.transaction.status")}</label>
              <select
                value={txn.status}
                onChange={(e) => patchTransaction({ status: e.target.value }, "status")}
                disabled={savingField === "status"}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="active">{t("detail.transaction.statusValues.active")}</option>
                <option value="pending">{t("detail.transaction.statusValues.pending")}</option>
                <option value="closed">{t("detail.transaction.statusValues.closed")}</option>
                <option value="terminated">{t("detail.transaction.statusValues.terminated")}</option>
              </select>
            </div>
          </div>
        ) : null}

        {tab === "people" ? (
          <CounterpartiesBlockBody
            transactionId={txn.id}
            counterparties={cps}
            onAdd={onCpAdd}
            onDelete={onCpDelete}
          />
        ) : null}

        {tab === "notes" ? (
          <div>
            <textarea
              defaultValue={txn.notes ?? ""}
              onBlur={(e) => {
                const value = e.target.value.trim() || null;
                if (value !== (txn.notes ?? null)) {
                  void patchTransaction({ notes: value }, "notes");
                }
              }}
              rows={9}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("detail.transaction.notesPlaceholder")}
            />
            {savingField === "notes" ? (
              <div className="mt-1 text-[11px] text-slate-500">Saving…</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Collapsible wrapper for the post-close DealReviewPanel. Open by
 * default — the AI summary is the agent's first deliverable on a
 * just-closed deal — but agents who don't need it on every visit can
 * collapse and the choice persists per-tab via component state. (We
 * don't persist to localStorage because the panel content is per-deal,
 * not a global preference.)
 */
function PostCloseReviewExpander({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">🏁</span>
          <h2 className="text-sm font-semibold text-slate-900">{t("detail.transaction.postCloseReview")}</h2>
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 py-3">{children}</div> : null}
    </section>
  );
}

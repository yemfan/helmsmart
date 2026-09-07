"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { PlaybookPickerModal } from "@/components/dashboard/PlaybooksPanel";
import { getPlaybook } from "@/lib/playbooks/definitions";
import type { PlaybookTaskRow } from "@/lib/playbooks/types";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Single unified playbook task list — replaces the prior split between a
 * "Today / overdue" cross-anchor card and a separate generic-anchor
 * `PlaybooksPanel` on the same page. Two filter axes:
 *
 *   - Status tabs (Open / Completed / Cancelled / All) drive the fetch
 *   - Tasks are grouped by playbook template ("category") with rows
 *     sorted by due date inside each group
 *
 * Per-row actions: complete, cancel (soft, keeps audit history), delay
 * (Tomorrow / Next week / pick a date). Apply / Remove batch are
 * deliberately not in the list — Apply is the single top-right button,
 * Remove batch is replaced by per-row cancel.
 */

type StatusTab = "open" | "done" | "cancelled" | "all";

/** Labels resolve from `dashboard:more.playbooks.tabs.*` at render. */
const TABS: { key: StatusTab }[] = [
  { key: "open" },
  { key: "done" },
  { key: "cancelled" },
  { key: "all" },
];

type LeadInfo = { id: string; name: string | null };

export function PlaybooksPageClient({ leads = [] }: { leads?: LeadInfo[] }) {
  // Named `tr` — task rows already bind `t` to a PlaybookTaskRow.
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [tasks, setTasks] = useState<PlaybookTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>("open");
  const [showPicker, setShowPicker] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Auto-dismiss the "Marked complete" / "Cancelled" / "Moved to ..."
  // banner after 5s — matches PlaybooksPanel's behaviour. Without it the
  // banner sits forever until the next action overwrites it, which made
  // it look like the page was stuck.
  useEffect(() => {
    if (!actionMsg) return;
    const t = window.setTimeout(() => setActionMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMsg]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch the full superset (open + completed + cancelled).
      // Tab counts at the top of the page are derived from this set, so
      // they must reflect the agent's true totals regardless of which
      // tab is active — switching tabs is a pure client-side filter, no
      // refetch.
      const params = new URLSearchParams({
        all: "1",
        includeCompleted: "1",
        includeCancelled: "1",
      });
      const res = await fetch(`/api/dashboard/playbooks?${params.toString()}`);
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        tasks?: PlaybookTaskRow[];
      } | null;
      if (body?.ok && Array.isArray(body.tasks)) setTasks(body.tasks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Re-fetch when the agent comes back from a detail page (mutations
    // could have happened there) — simple focus-poll, cheaper than
    // wiring full pubsub.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const stats = useMemo(() => computeStats(tasks), [tasks]);

  /**
   * Visible rows: filter to the active status tab, then group by
   * apply batch (each tr("more.playbooks.applyPlaybook") click) so two applies of the
   * same template land as separate cards. Sort within group by due
   * date asc (nulls last).
   */
  const leadNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads) {
      if (l.name?.trim()) m.set(l.id, l.name);
    }
    return m;
  }, [leads]);

  const visible = useMemo(() => {
    const filtered = tasks.filter((t) => matchesStatus(t, statusTab));
    return groupByBatch(filtered, leadNameMap, tr);
  }, [tasks, statusTab, leadNameMap]);

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/dashboard/playbooks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errBody.error ?? `HTTP ${res.status}`);
    }
  }

  async function markComplete(t: PlaybookTaskRow) {
    const completed = !t.completed_at;
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              completed_at: completed ? new Date().toISOString() : null,
            }
          : x,
      ),
    );
    try {
      await patchTask(t.id, { completed });
      setActionMsg(completed ? tr("more.playbooks.markedComplete") : tr("more.playbooks.reopened"));
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : tr("more.playbooks.updateFailed"));
      await load();
    }
  }

  async function markCancelled(t: PlaybookTaskRow) {
    const cancelled = !t.cancelled_at;
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              cancelled_at: cancelled ? new Date().toISOString() : null,
            }
          : x,
      ),
    );
    try {
      await patchTask(t.id, { cancelled });
      setActionMsg(cancelled ? tr("more.playbooks.cancelled") : tr("more.playbooks.reopened"));
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : tr("more.playbooks.updateFailed"));
      await load();
    }
  }

  async function reschedule(t: PlaybookTaskRow, ymd: string) {
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, due_date: ymd } : x)),
    );
    try {
      await patchTask(t.id, { dueDate: ymd });
      setActionMsg(`Moved to ${formatYmd(ymd, locale)}.`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : tr("more.playbooks.updateFailed"));
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">📋 {tr("more.playbooks.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {tr("more.playbooks.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#005ca8]"
        >
          {tr("more.playbooks.applyPlaybook")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={tr("more.playbooks.dueToday")} value={String(stats.dueToday)} tone="blue" />
        <Stat label={tr("more.playbooks.overdue")} value={String(stats.overdue)} tone={stats.overdue > 0 ? "red" : "slate"} />
        <Stat label={tr("more.playbooks.thisWeek")} value={String(stats.thisWeek)} />
        <Stat label={tr("more.playbooks.doneRecent")} value={String(stats.doneRecent)} tone="green" />
      </div>

      {actionMsg ? (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {actionMsg}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => {
          const count = tasks.filter((t) => matchesStatus(t, tab.key)).length;
          const active = statusTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tr(`more.playbooks.tabs.${tab.key}`, { defaultValue: tab.key })}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? "bg-blue-50 text-blue-700" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-sm text-slate-500 shadow-sm">
          <LoadingText />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 shadow-sm">
          {statusTab === "open"
            ? tr("more.playbooks.emptyOpen")
            : statusTab === "done"
              ? tr("more.playbooks.emptyDone")
              : statusTab === "cancelled"
                ? tr("more.playbooks.emptyCancelled")
                : tr("more.playbooks.emptyNone")}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
            >
              <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{group.title}</div>
                  {group.subtitle ? (
                    <div className="mt-0.5 text-[11px] text-slate-500 truncate">{group.subtitle}</div>
                  ) : null}
                </div>
                <span className="ml-3 shrink-0 text-[11px] text-slate-500 tabular-nums">
                  {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                </span>
              </header>
              {/* Column header row — same grid template as TaskRow so
                  Task / Contact / Due / Actions align over their columns. */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)_72px_104px] items-center gap-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <div>{tr("more.playbooks.columns.task")}</div>
                <div>{tr("more.playbooks.columns.contact")}</div>
                <div>{tr("more.playbooks.columns.due")}</div>
                <div className="sr-only">{tr("more.playbooks.columns.actions")}</div>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    contactName={contactNameFor(t, leadNameMap)}
                    onComplete={() => void markComplete(t)}
                    onCancel={() => void markCancelled(t)}
                    onReschedule={(ymd) => void reschedule(t, ymd)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showPicker ? (
        <PlaybookPickerModal
          anchorKind="generic"
          anchorId={null}
          leads={leads}
          onClose={() => setShowPicker(false)}
          onApplied={(count, title) => {
            setShowPicker(false);
            setActionMsg(
              count === 1
                ? `Added 1 task from "${title}".`
                : `Added ${count} tasks from "${title}".`,
            );
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ── Row + actions ─────────────────────────────────────────────────────

function TaskRow({
  task,
  contactName,
  onComplete,
  onCancel,
  onReschedule,
}: {
  task: PlaybookTaskRow;
  contactName: string | null;
  onComplete: () => void;
  onCancel: () => void;
  onReschedule: (ymd: string) => void;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const complete = task.completed_at != null;
  const cancelled = task.cancelled_at != null;
  const closed = complete || cancelled;
  const overdue = !closed && task.due_date != null && task.due_date < todayYmd();

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)_72px_104px] items-start gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <div
          className={`text-sm leading-tight ${
            closed ? "text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {task.title}
        </div>
        {task.notes ? (
          <div className="mt-0.5 text-[11px] text-slate-500 leading-snug">{task.notes}</div>
        ) : null}
        {task.section || cancelled ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            {task.section ? (
              <span className="font-medium uppercase tracking-wide text-slate-500">
                {task.section}
              </span>
            ) : null}
            {cancelled ? (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{tr("pages.playbooksPage.cancelled")}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="min-w-0 pt-0.5 text-xs">
        {contactName ? (
          task.anchor_kind === "contact" && task.anchor_id ? (
            <a
              href={`/dashboard/contacts/${task.anchor_id}`}
              className="block truncate text-slate-700 dark:text-slate-300 hover:text-slate-900 hover:underline"
              title={contactName}
            >
              {contactName}
            </a>
          ) : (
            <span className="block truncate text-slate-600 dark:text-slate-400" title={contactName}>
              {contactName}
            </span>
          )
        ) : (
          <AnchorChip task={task} fallback={<span className="text-slate-500">—</span>} />
        )}
      </div>
      <div
        className={`shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums ${
          overdue
            ? "font-medium text-red-600"
            : cancelled
              ? "text-slate-500 line-through"
              : "text-slate-500"
        }`}
      >
        {task.due_date ? formatYmd(task.due_date, locale) : "—"}
      </div>
      <div className="inline-flex shrink-0 items-center gap-1 pt-0.5">
        <IconButton
          onClick={onComplete}
          title={complete ? tr("more.playbooks.reopen") : tr("more.playbooks.markDone")}
          ariaLabel={complete ? tr("more.playbooks.reopenAria", { title: task.title }) : tr("more.playbooks.markDoneAria", { title: task.title })}
          tone="success"
          active={complete}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </IconButton>
        <DelayButton
          disabled={complete}
          currentDueDate={task.due_date}
          onPick={onReschedule}
        />
        <IconButton
          onClick={onCancel}
          title={cancelled ? tr("more.playbooks.restore") : tr("more.playbooks.cancel")}
          ariaLabel={cancelled ? tr("more.playbooks.restoreAria", { title: task.title }) : tr("more.playbooks.cancelAria", { title: task.title })}
          tone="danger"
          active={cancelled}
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
  disabled,
  tone,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  tone: "success" | "danger" | "neutral";
  active?: boolean;
}) {
  const toneClasses =
    tone === "success"
      ? active
        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
      : tone === "danger"
        ? active
          ? "border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-slate-200 bg-white text-slate-500 hover:border-rose-400 hover:text-rose-600"
        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition disabled:opacity-40 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

/**
 * Delay menu — three preset options (Tomorrow / Next week / pick a
 * date). The "pick a date" tail uses a native `<input type="date">`
 * inside the popover so the agent can hop straight to a custom date
 * without a second modal.
 */
function DelayButton({
  disabled,
  currentDueDate,
  onPick,
}: {
  disabled?: boolean;
  currentDueDate: string | null;
  onPick: (ymd: string) => void;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function pick(days: number) {
    setOpen(false);
    onPick(shiftYmd(todayYmd(), days));
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={tr("more.playbooks.delay")}
        aria-label={tr("more.playbooks.delay")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 transition hover:border-amber-400 hover:text-amber-600 disabled:opacity-40"
      >
        <CalendarClock className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 origin-top-right overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(1)}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{tr("pages.playbooksPage.tomorrow")}</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(7)}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{tr("pages.playbooksPage.nextWeek")}</button>
          <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2">
            <label className="block text-[11px] font-medium text-slate-500">{tr("more.playbooks.pickDate")}</label>
            <input
              type="date"
              defaultValue={currentDueDate ?? todayYmd()}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setOpen(false);
                onPick(v);
              }}
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnchorChip({
  task,
  fallback = null,
}: {
  task: PlaybookTaskRow;
  fallback?: React.ReactNode;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (task.anchor_kind === "transaction" && task.anchor_id) {
    return (
      <a
        href={`/dashboard/transactions/${task.anchor_id}`}
        className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300 hover:underline"
      >
        ↗ Transaction
      </a>
    );
  }
  if (task.anchor_kind === "open_house" && task.anchor_id) {
    return (
      <a
        href={`/dashboard/open-houses/${task.anchor_id}`}
        className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300 hover:underline"
      >
        {tr("pages.playbooksPage.openHouse")}
      </a>
    );
  }
  if (task.anchor_kind === "contact" && task.anchor_id) {
    return (
      <a
        href={`/dashboard/contacts/${task.anchor_id}`}
        className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300 hover:underline"
      >
        ↗ Contact
      </a>
    );
  }
  return <>{fallback}</>;
}

/**
 * Resolves the displayable contact name for a task. Only contact-anchored
 * tasks have a usable name (transaction/open-house anchors aren't loaded
 * here). Returns null when there's nothing to show — caller falls back to
 * an anchor chip or em-dash.
 */
function contactNameFor(
  task: PlaybookTaskRow,
  leadNameMap: Map<string, string>,
): string | null {
  if (task.anchor_kind === "contact" && task.anchor_id) {
    return leadNameMap.get(task.anchor_id) ?? `Contact #${task.anchor_id.slice(0, 6)}`;
  }
  return null;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "red" | "slate";
}) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "green"
        ? "text-green-700"
        : tone === "red"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function matchesStatus(t: PlaybookTaskRow, tab: StatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "done") return t.completed_at != null;
  if (tab === "cancelled") return t.cancelled_at != null;
  // open = not done, not cancelled
  return t.completed_at == null && t.cancelled_at == null;
}

type Group = {
  /** Stable React key — batch id, or "__adhoc__" for tasks with no batch. */
  id: string;
  title: string;
  /** Lead name / anchor descriptor / template-key fallback. */
  subtitle: string | null;
  tasks: PlaybookTaskRow[];
};

/**
 * Group by `apply_batch_id` so re-applying the same playbook (e.g.
 * tr("more.playbooks.writeOffer") for two different leads) renders as separate cards.
 * Within each card, sort by due date asc (nulls last), then created_at.
 *
 * Subtitle resolution priority:
 *   - anchor_kind=contact → contact name from leads map (or "#id" fallback)
 *   - anchor_kind=transaction / open_house → tr("more.playbooks.linkedTransaction") etc.
 *   - no anchor → null (header stays clean)
 */
function groupByBatch(
  tasks: PlaybookTaskRow[],
  leadNameMap: Map<string, string>,
  tr: (k: string, o?: Record<string, unknown>) => string,
): Group[] {
  const groups = new Map<string, PlaybookTaskRow[]>();
  for (const t of tasks) {
    const key = t.apply_batch_id ?? `__adhoc__${t.template_key ?? "custom"}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: Group[] = [];
  groups.forEach((list, id) => {
    list.sort((a, b) => {
      const aD = a.due_date ?? "9999-12-31";
      const bD = b.due_date ?? "9999-12-31";
      if (aD !== bD) return aD.localeCompare(bD);
      return a.created_at.localeCompare(b.created_at);
    });
    const first = list[0];
    const meta = first.template_key ? getPlaybook(first.template_key) : null;
    const title =
      meta?.title ??
      first.template_key ??
      tr("more.playbooks.adHocTasks");
    out.push({
      id,
      title,
      subtitle: subtitleFor(first, leadNameMap, tr),
      tasks: list,
    });
  });
  // Group order: earliest open due-date first; closed-only batches sink.
  out.sort((a, b) => {
    const aDue = earliestOpenDue(a.tasks);
    const bDue = earliestOpenDue(b.tasks);
    return aDue.localeCompare(bDue);
  });
  return out;
}

function subtitleFor(
  task: PlaybookTaskRow,
  leadNameMap: Map<string, string>,
  tr: (k: string, o?: Record<string, unknown>) => string,
): string | null {
  if (task.anchor_kind === "contact" && task.anchor_id) {
    return leadNameMap.get(task.anchor_id) ?? `Contact #${task.anchor_id.slice(0, 6)}`;
  }
  if (task.anchor_kind === "transaction") return tr("more.playbooks.linkedTransaction");
  if (task.anchor_kind === "open_house") return tr("more.playbooks.linkedOpenHouse");
  return null;
}

function earliestOpenDue(tasks: PlaybookTaskRow[]): string {
  let min = "9999-12-31";
  for (const t of tasks) {
    if (t.completed_at || t.cancelled_at) continue;
    if (!t.due_date) continue;
    if (t.due_date < min) min = t.due_date;
  }
  return min;
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
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function computeStats(all: PlaybookTaskRow[]): {
  dueToday: number;
  overdue: number;
  thisWeek: number;
  doneRecent: number;
} {
  const today = todayYmd();
  const weekFromNow = shiftYmd(today, 7);
  const weekAgo = shiftYmd(today, -7);
  let dueToday = 0;
  let overdue = 0;
  let thisWeek = 0;
  let doneRecent = 0;
  for (const t of all) {
    if (t.cancelled_at) continue; // cancelled doesn't count toward any tile
    if (t.completed_at) {
      if (t.completed_at.slice(0, 10) >= weekAgo) doneRecent += 1;
      continue;
    }
    if (!t.due_date) continue;
    if (t.due_date === today) dueToday += 1;
    else if (t.due_date < today) overdue += 1;
    if (t.due_date >= today && t.due_date <= weekFromNow) thisWeek += 1;
  }
  return { dueToday, overdue, thisWeek, doneRecent };
}


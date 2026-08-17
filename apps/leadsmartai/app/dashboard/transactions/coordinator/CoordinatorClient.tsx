"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import type {
  CoordinatorBoard,
  CoordinatorStageColumn,
  CoordinatorTransactionCard,
} from "@/lib/transactions/coordinator/grouping";
import type { TransactionType } from "@/lib/transactions/types";
import { TransactionTypeBadge } from "@/components/transactions/TransactionAtoms";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateShort(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

type Translate = (k: string, o?: Record<string, unknown>) => string;

function daysFromTodayLabel(iso: string | null, t: Translate, locale: string): string | null {
  if (!iso) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  const targetMs = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(targetMs)) return null;
  const days = Math.round((targetMs - todayMs) / 86_400_000);
  if (days === 0) return t("pages.coordinator.today");
  if (days === 1) return t("pages.coordinator.tomorrow");
  if (days === -1) return t("pages.coordinator.yesterday");
  if (days < 0) return t("pages.coordinator.daysOverdue", { count: -days });
  if (days <= 30) return t("pages.coordinator.inDays", { count: days });
  return formatDateShort(iso, locale);
}

export default function CoordinatorClient() {
  const { t } = useTranslation("dashboard");
  const [board, setBoard] = useState<CoordinatorBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/transactions/coordinator", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          board?: CoordinatorBoard;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false || !data.board) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setBoard(data.board);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-2xl bg-slate-100"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("pages.dashFragments.couldntLoadCoordinator")} {error ?? "unknown error"}
      </div>
    );
  }

  return <CoordinatorBody board={board} />;
}

/**
 * Inner body once the data has loaded. Split out so the role filter
 * + per-column metrics can be computed against the loaded board
 * without bloating the wrapper component.
 */
type RoleFilter = "all" | TransactionType;

/** Keyed lookup: a module-scope map cannot reach the translator. */
const ROLE_KEYS: Record<RoleFilter, string> = {
  all: "pages.coordinator.roleAll",
  buyer_rep: "pages.coordinator.roleBuyer",
  listing_rep: "pages.coordinator.roleListing",
  dual: "pages.coordinator.roleDual",
};

function CoordinatorBody({ board }: { board: CoordinatorBoard }) {
  const { t } = useTranslation("dashboard");
  const [role, setRole] = useState<RoleFilter>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const v = window.localStorage.getItem("leadsmart.txn.coordinator.role");
      return v === "buyer_rep" || v === "listing_rep" || v === "dual" ? v : "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("leadsmart.txn.coordinator.role", role);
    } catch {
      // non-fatal
    }
  }, [role]);

  /**
   * Column slices after applying the role filter. `cards` are filtered
   * client-side; we keep totals from the full board so the KPI strip
   * stays a stable headline number.
   */
  const filteredColumns = useMemo(() => {
    if (role === "all") return board.columns;
    return board.columns.map((c) => ({
      ...c,
      cards: c.cards.filter((card) => card.transaction.transaction_type === role),
    }));
  }, [board.columns, role]);

  return (
    <div className="space-y-6">
      <KpiStrip totals={board.totals} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {t("pages.coordinator.show")}
        </span>
        {(Object.keys(ROLE_KEYS) as RoleFilter[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              role === r
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {t(ROLE_KEYS[r])}
          </button>
        ))}
      </div>

      {board.totals.transactionCount === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
          <p className="text-base font-semibold text-slate-900">{t("pages.coordinator.noDeals")}</p>
          <p className="mt-1">
            {t("pages.coordinator.noDealsHint")}{" "}
            <Link href="/dashboard/transactions" className="font-semibold text-slate-700 underline">
              {t("pages.coordinator.transactions")}
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {filteredColumns.map((column) => (
            <StageColumn key={column.stage} column={column} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiStrip({ totals }: { totals: CoordinatorBoard["totals"] }) {
  const { t } = useTranslation("dashboard");
  const cells = [
    {
      label: t("pages.coordinator.inFlight"),
      value: String(totals.transactionCount),
      tone: "text-slate-900",
    },
    {
      label: t("pages.coordinator.overdueTasks"),
      value: String(totals.overdueTasksTotal),
      tone: totals.overdueTasksTotal > 0 ? "text-rose-700" : "text-slate-900",
    },
    {
      label: t("pages.coordinator.closingThisWeek"),
      value: String(totals.closingThisWeek),
      tone: totals.closingThisWeek > 0 ? "text-emerald-700" : "text-slate-900",
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {c.label}
          </p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-column bottleneck signal: average days until the earliest open
 * deadline across cards in this column. Negative means the column is
 * running overdue on average — surface red so the agent can spot the
 * stuck stage without scanning every card.
 *
 * Uses the same `byStage[stage].earliestDue` already computed for the
 * card body, so this is pure derived state.
 */
function avgDaysToDeadline(column: CoordinatorStageColumn): number | null {
  const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(todayMs)) return null;
  const samples: number[] = [];
  for (const card of column.cards) {
    const due = card.byStage[column.stage]?.earliestDue;
    if (!due) continue;
    const dueMs = Date.parse(`${due}T00:00:00Z`);
    if (!Number.isFinite(dueMs)) continue;
    samples.push(Math.round((dueMs - todayMs) / 86_400_000));
  }
  if (samples.length === 0) return null;
  const sum = samples.reduce((s, n) => s + n, 0);
  return Math.round(sum / samples.length);
}

function StageColumn({ column }: { column: CoordinatorStageColumn }) {
  const { t } = useTranslation("dashboard");
  const avg = avgDaysToDeadline(column);
  const overdueCards = column.cards.filter((c) => c.byStage[column.stage]?.overdueCount > 0).length;

  return (
    <section className="flex min-h-[200px] flex-col rounded-2xl border border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {column.label}
        </h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
          {column.cards.length}
        </span>
      </header>

      {/* Bottleneck signal — only render when at least one card has a
          dated deadline. Negative avg = column is running overdue. */}
      {avg != null ? (
        <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-1.5 text-[10px]">
          <span className={avg < 0 ? "font-semibold text-rose-700" : "text-slate-500"}>
            {avg < 0
              ? t("pages.coordinator.avgPast", { days: -avg })
              : t("pages.coordinator.avgToDeadline", { days: avg })}
          </span>
          {overdueCards > 0 ? (
            <span className="font-semibold text-rose-700">
              {t("pages.coordinator.overdueCount", { count: overdueCards })}
            </span>
          ) : null}
        </div>
      ) : null}

      {column.cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-center text-[11px] text-slate-400">
          {t("pages.coordinator.noWork")}
        </div>
      ) : (
        <ul className="space-y-2 p-2">
          {column.cards.map((card) => (
            <li key={card.transaction.id}>
              <CardForStage stage={column.stage} card={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CardForStage({
  stage,
  card,
}: {
  stage: CoordinatorStageColumn["stage"];
  card: CoordinatorTransactionCard;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const stageMetrics = card.byStage[stage];
  const txn = card.transaction;
  const isPastDue = stageMetrics.overdueCount > 0;
  const dueLabel = daysFromTodayLabel(stageMetrics.earliestDue, t, locale);

  return (
    <Link
      href={`/dashboard/transactions/${encodeURIComponent(txn.id)}`}
      className={`block rounded-xl border bg-white px-3 py-2.5 shadow-sm transition hover:shadow ${
        isPastDue ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs font-semibold text-slate-900">
          {txn.property_address}
        </p>
        {isPastDue ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
            {t("pages.coordinator.overdueCount", { count: stageMetrics.overdueCount })}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
        <TransactionTypeBadge type={txn.transaction_type} />
        <span className="truncate">
          {txn.contact_name ?? "—"}
          {txn.purchase_price ? ` · ${formatMoney(txn.purchase_price)}` : ""}
        </span>
      </div>

      {stageMetrics.nextUpTitle ? (
        <p className="mt-2 line-clamp-2 text-[11px] text-slate-700">
          <span className="font-semibold">{t("pages.coordinator.next")}</span> {stageMetrics.nextUpTitle}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          {t("pages.coordinator.openCount", { count: stageMetrics.openCount })}
          {card.overall.totalTasks > 0
            ? ` · ${t("pages.coordinator.allStage", {
                done: card.overall.completedTasks,
                total: card.overall.totalTasks,
              })}`
            : ""}
        </span>
        {dueLabel ? (
          <span
            className={`font-semibold ${isPastDue ? "text-rose-700" : "text-slate-700"}`}
          >
            {dueLabel}
          </span>
        ) : null}
      </div>

      {txn.closing_date ? (
        <p className="mt-1 text-[10px] text-slate-400">
          {t("pages.coordinator.closingOn", { date: formatDateShort(txn.closing_date, locale) })}
        </p>
      ) : null}
    </Link>
  );
}

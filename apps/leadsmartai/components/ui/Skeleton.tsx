"use client";

/** Skeleton shimmer block — use for loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg bg-slate-200 animate-skeleton ${className}`} />
  );
}

/** Pre-built skeleton for a KPI card row (4 cards). */
export function KpiCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Pre-built skeleton for a table (header + N rows). */
export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="border-t border-slate-50">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-4 py-3">
                    <Skeleton className={`h-3 ${c === 0 ? "w-28" : "w-16"}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Pre-built skeleton for a chart card. */
export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-[140px] w-full rounded-lg" />
    </div>
  );
}

/** Full page loading skeleton: heading + KPIs + charts + table. */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-40 mb-2" />
        <Skeleton className="h-3 w-64" />
      </div>
      <KpiCardsSkeleton />
      <div className="grid gap-3 md:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}

import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  kpis: ReactNode;
  children: ReactNode;
  /** Override KPI row grid when you need more than five cards (e.g. admin overview). */
  kpiGridClassName?: string;
  /**
   * Right-aligned action slot in the header. Used for cross-app
   * bridge buttons ("Open CloseBoss →") and dashboard-level
   * primary CTAs. Optional — header collapses to title-only when
   * omitted.
   */
  actions?: ReactNode;
};

export function DashboardShell({
  title,
  subtitle,
  kpis,
  children,
  kpiGridClassName = "grid gap-4 sm:grid-cols-2 lg:grid-cols-5",
  actions,
}: Props) {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-gray-600 md:text-base">{subtitle}</p>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        <div className={kpiGridClassName}>{kpis}</div>
        <div className="space-y-6">{children}</div>
      </div>
    </main>
  );
}

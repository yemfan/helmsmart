import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shell for one settings group page: a way back to the index, the group's
 * name and one-line purpose, then the panels. Server-safe (no hooks) so the
 * group pages can stay server components and fetch what their panels need.
 */
export function SettingsGroupPage({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description: string;
  /** Label for the link back to the settings index. */
  back: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40"
      >
        {back}
      </Link>
      <div className="mb-5 mt-3">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** One titled panel on a group page. */
export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-0.5 mb-3 text-xs text-gray-500">{description}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

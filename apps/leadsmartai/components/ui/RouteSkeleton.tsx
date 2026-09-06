"use client";

import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";

/**
 * Skeletons for Next.js `loading.tsx` files. Every dashboard route used to
 * paint a blank pane, then fill in once its client fetch returned; the audit
 * counted zero route-level loading states across 62 route folders. These are
 * deliberately plain — a page's outline, not a fake version of its content.
 */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-3 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Search + filter row, then a table (Contacts, Tasks, Listings, Transactions). */
export function ListPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div>
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-28" />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}

/** Two panes: a conversation list and an empty thread (Conversations). */
export function ThreadPageSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm" aria-busy="true" aria-live="polite">
      <div className="w-full shrink-0 border-r border-gray-200 p-3 lg:max-w-sm">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="mb-3 h-8 w-full" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 lg:block" />
    </div>
  );
}

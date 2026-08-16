import { getServerT } from "@/lib/i18n/server";

export default async function OnboardingLoading() {
  const t = await getServerT();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,114,206,0.25),transparent)]" />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:max-w-xl sm:px-6 sm:py-12">
        {/* Header skeleton */}
        <div className="mb-6 flex items-center justify-between gap-3 onboarding-fade-up">
          <div className="h-8 w-40 bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-16 bg-slate-700 rounded animate-pulse" />
        </div>

        {/* Progress bar skeleton */}
        <div className="mb-8 animate-pulse">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
            <div className="h-4 w-20 bg-slate-700 rounded" />
            <div className="h-4 w-12 bg-slate-700 rounded" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full w-1/4 rounded-full bg-slate-600" />
          </div>
          <div className="mt-1.5 h-3 w-64 bg-slate-700 rounded text-[11px]" />
        </div>

        {/* Content area skeleton */}
        <div className="onboarding-fade-up flex-1 space-y-6 animate-pulse">
          {/* Title skeleton */}
          <div className="space-y-3">
            <div className="h-8 bg-slate-700 rounded w-3/4" />
            <div className="h-4 bg-slate-700 rounded w-1/2" />
          </div>

          {/* Options/form skeleton */}
          <div className="space-y-3">
            <div className="h-12 bg-slate-700 rounded-lg" />
            <div className="h-12 bg-slate-700 rounded-lg" />
            <div className="h-12 bg-slate-700 rounded-lg" />
          </div>

          {/* Description text skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-slate-700 rounded" />
            <div className="h-4 bg-slate-700 rounded w-5/6" />
          </div>
        </div>

        {/* Footer button skeleton */}
        <div className="mt-8 flex justify-end gap-3 animate-pulse">
          <div className="h-10 w-24 bg-slate-700 rounded-lg" />
          <div className="h-10 w-32 bg-slate-600 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

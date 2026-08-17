"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Dashboard widget for CloseBoss Coaching enrollment.
 *
 * Three states:
 *   - loading: skeleton
 *   - no eligible programs (Starter): "Upgrade for coaching" empty state
 *   - has eligible programs: cards per program with status + targets
 *
 * Status comes from `/api/coaching/me`:
 *   - 'enrolled'                — show progress vs target placeholder
 *   - 'eligible_not_enrolled'   — "Enroll" CTA
 *   - 'opted_out'               — "Re-enroll" CTA
 *   - 'not_eligible'            — hidden (filtered out below)
 *
 * Progress numbers (transactions YTD, conversion rate) are
 * placeholders for the MVP — the real wiring lives in a follow-up
 * that joins to transactions + contacts data.
 */

type ProgramView = {
  slug: "producer_track" | "top_producer_track";
  status: "enrolled" | "opted_out" | "eligible_not_enrolled" | "not_eligible";
  enrolledAt: string | null;
  meta: {
    name: string;
    tagline: string;
    annualTransactionTarget: number;
    conversionRateTargetPct: number;
  };
};

type ApiResponse = {
  ok: boolean;
  plan: string | null;
  programs: ProgramView[];
};

export function CoachingProgramsCard() {
  const { t } = useTranslation("dashboard");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coaching/me")
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <SkeletonCard />;

  const programs = (data?.programs ?? []).filter(
    (p) => p.status !== "not_eligible",
  );

  if (programs.length === 0) {
    return <UpgradePrompt />;
  }

  return (
    <section
      aria-label={t("pages.coaching.brand")}
      className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{t("pages.coaching.brand")}</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">{t("pages.coaching.yourPrograms")}</h2>
        </div>
        <a
          href="/agent/coaching"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          Learn more →
        </a>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {programs.map((p) => (
          <ProgramRow key={p.slug} program={p} />
        ))}
      </div>
    </section>
  );
}

function ProgramRow({ program }: { program: ProgramView }) {
  const { t } = useTranslation("dashboard");
  const isEnrolled = program.status === "enrolled";
  const isOptedOut = program.status === "opted_out";
  return (
    <div
      className={[
        "rounded-xl border p-4",
        isEnrolled
          ? "border-blue-200 bg-blue-50/40"
          : "border-slate-200 bg-slate-50/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {program.meta.name}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider font-semibold">
            {isEnrolled ? (
              <span className="text-blue-700">{t("pages.coaching.enrolled")}</span>
            ) : isOptedOut ? (
              <span className="text-slate-500">{t("pages.coaching.optedOut")}</span>
            ) : (
              <span className="text-amber-700">{t("pages.coaching.eligible")}</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Mini
          label={t("pages.coaching.goal")}
          value={`${program.meta.annualTransactionTarget} deals`}
        />
        <Mini
          label={t("pages.coaching.convTarget")}
          value={`${program.meta.conversionRateTargetPct}%`}
        />
      </div>

      {!isEnrolled ? (
        <p className="mt-3 text-[11px] text-slate-600">
          {isOptedOut
            ? "You opted out earlier. Re-enroll any time from settings."
            : "Auto-enrollment runs on your next sign-in. Or enroll now to start tracking."}
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600">{t("pages.coaching.trackingNote")}</p>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function UpgradePrompt() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{t("pages.coaching.brand")}</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">{t("pages.coaching.addToPlan")}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("pages.coaching.upsell")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/agent/pricing"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >{t("pages.coaching.seePricing")}</a>
        <a
          href="/agent/coaching"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
        >{t("pages.coaching.learnHow")}</a>
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-5 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="h-10 animate-pulse rounded bg-slate-100" />
              <div className="h-10 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

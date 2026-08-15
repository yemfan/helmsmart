"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import AddressAutocomplete from "@/components/AddressAutocomplete";

/**
 * Contains any render error to a small inline fallback instead of letting it
 * bubble to the route (which manifested as the quota badge tiling the screen
 * after a failed generation). Defensive — the form itself shouldn't throw.
 */
class CmaErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Something went wrong rendering this view.{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-semibold underline"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type CmaListRow = {
  id: string;
  agentId: string;
  contactId: string | null;
  subjectAddress: string;
  estimatedValue: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  confidenceScore: number | null;
  compCount: number;
  title: string | null;
  createdAt: string;
};

type CmaQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  reached: boolean;
  warning: boolean;
  unlimited?: boolean;
  resetDate: string;
};

function formatMoney(n: number | null | undefined, locale: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CmaListClient() {
  return (
    <CmaErrorBoundary>
      <CmaListInner />
    </CmaErrorBoundary>
  );
}

function CmaListInner() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [rows, setRows] = useState<CmaListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [quota, setQuota] = useState<CmaQuota | null>(null);
  const router = useRouter();

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/cma/quota", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        quota?: CmaQuota;
      };
      if (data.ok && data.quota) setQuota(data.quota);
    } catch {
      /* non-fatal — quota hint just won't render */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/cma", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        cmas?: CmaListRow[];
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setRows(data.cmas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pages.cma.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshQuota();
  }, [refresh, refreshQuota]);

  const onCreate = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/dashboard/cma", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectAddress: address.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        cma?: CmaListRow;
        error?: string;
      };
      if (!res.ok || data.ok === false || !data.cma) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setAddress("");
      setShowForm(false);
      // Jump straight to the freshly generated CMA instead of the list.
      router.push(`/dashboard/cma/${encodeURIComponent(data.cma.id)}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t("pages.cma.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [address, router]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {loading ? t("pages.cma.loading") : t("pages.cma.savedCount", { count: rows.length })}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {showForm ? t("pages.cma.cancel") : t("pages.cma.newCma")}
        </button>
      </div>

      {showForm ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t("pages.cma.generateHeading")}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("pages.cma.generateIntro")}
              </p>
            </div>
            {quota ? <QuotaPill quota={quota} /> : null}
          </div>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                {t("pages.cma.subjectAddress")}
              </span>
              <div className="mt-1">
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  placeholder={t("pages.cma.addressPlaceholder")}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  disabled={submitting || quota?.reached === true}
                />
              </div>
            </label>
            <div className="flex items-center justify-between gap-3">
              <div className="min-h-[20px] text-xs">
                {submitError ? (
                  <span className="text-rose-600">{submitError}</span>
                ) : quota?.reached ? (
                  <span className="text-amber-700">
                    {t("pages.cma.quotaReached")}
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {t("pages.cma.liveWeb")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onCreate}
                disabled={
                  submitting ||
                  address.trim().length === 0 ||
                  quota?.reached === true
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t("pages.cma.generating") : t("pages.cma.generate")}
              </button>
            </div>
            {submitting ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 align-[-1px]" aria-hidden />
                {t("pages.cma.working")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("pages.cma.loadFailedInline")} {error}
        </div>
      ) : null}

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
              aria-hidden
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          {t("pages.cma.empty")}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/cma/${encodeURIComponent(r.id)}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {r.title || r.subjectAddress}
                  </p>
                  {r.title ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {r.subjectAddress}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDate(r.createdAt, locale)} · {t("pages.cma.comps", { count: r.compCount })}
                    {r.confidenceScore != null
                      ? ` · ${t("pages.cma.confidence", { score: r.confidenceScore })}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold tabular-nums text-slate-900">
                    {formatMoney(r.estimatedValue, locale)}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {formatMoney(r.lowEstimate, locale)} – {formatMoney(r.highEstimate, locale)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuotaPill({ quota }: { quota: CmaQuota }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const tone = quota.reached
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : quota.warning
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${tone}`}
      title={t("pages.cma.quotaTitle", { date: quota.resetDate })}
    >
      {quota.unlimited
        ? t("pages.cma.unlimited")
        : t("pages.cma.remaining", { remaining: quota.remaining, limit: quota.limit })}
    </span>
  );
}

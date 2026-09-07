"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Per-agent IDX lead-routing settings.
 *
 * Two controls:
 *   1. Toggle — enrolls this agent in the round-robin pool. Off by
 *      default; agents have to opt in. The picker only loads agents
 *      where in_round_robin=true.
 *   2. ZIP coverage — comma- or whitespace-separated list of 5-digit
 *      ZIPs. Empty = no constraint (eligible for any lead). When set,
 *      narrows the assignment pool for leads in those ZIPs.
 *
 * Saves to /api/dashboard/agent/routing-rules (RLS-scoped to the agent's
 * own row). Server sanitizes ZIP input regardless of what the client sent.
 */

type Rule = {
  agentId: string;
  inRoundRobin: boolean;
  zipCoverage: string[];
  priority: number;
  updatedAt: string | null;
};

export default function LeadRoutingSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [inRoundRobin, setInRoundRobin] = useState(false);
  const [zipText, setZipText] = useState("");
  const [parsedZips, setParsedZips] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent/routing-rules", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rule?: Rule;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.rule) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setInRoundRobin(json.rule.inRoundRobin);
      setZipText(json.rule.zipCoverage.join(", "));
      setParsedZips(json.rule.zipCoverage);
      setUpdatedAt(json.rule.updatedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-preview the cleaned ZIP list as the user types.
  useEffect(() => {
    setParsedZips(parseZips(zipText));
  }, [zipText]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent/routing-rules", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inRoundRobin,
          zipCoverage: zipText,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rule?: Rule;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.rule) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setInRoundRobin(json.rule.inRoundRobin);
      setZipText(json.rule.zipCoverage.join(", "));
      setParsedZips(json.rule.zipCoverage);
      setUpdatedAt(json.rule.updatedAt);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [inRoundRobin, zipText]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <header className="border-b border-slate-100 dark:border-slate-700 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.leadRoutingSettings.title")}</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("pages.leadRoutingSettings.intro")}</p>
          </div>
          {updatedAt ? (
            <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("pages.dashFragments.saved")} {formatDate(updatedAt)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={inRoundRobin}
                onChange={(e) => setInRoundRobin(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-slate-900"
              />
              <span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.leadRoutingSettings.includeMe")}</span>
                <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{t("pages.leadRoutingSettings.includeHint")}</span>
              </span>
            </label>

            <div>
              <label htmlFor="leadroutingsettingspanel-1" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.leadRoutingSettings.zipCoverage")}</label>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("pages.leadRoutingSettings.zipHint")}</p>
              <textarea id="leadroutingsettingspanel-1"
                value={zipText}
                onChange={(e) => setZipText(e.target.value)}
                rows={3}
                placeholder="78701, 78702, 78703"
                className="mt-2 block w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              <ZipPreview parsed={parsedZips} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-h-[20px] text-xs">
                {error ? (
                  <span className="text-rose-600">{error}</span>
                ) : savedAt && Date.now() - savedAt < 4000 ? (
                  <span className="text-emerald-600">{t("pages.leadRoutingSettings.saved")}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#005ca8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? t("common:status.saving") : t("common:actions.save_settings")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ZipPreview({ parsed }: { parsed: string[] }) {
  const { t } = useTranslation("dashboard");
  if (parsed.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-slate-500">{t("pages.leadRoutingSettings.noZips")}</p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {parsed.map((z) => (
        <span
          key={z}
          className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300"
        >
          {z}
        </span>
      ))}
    </div>
  );
}

function parseZips(input: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input.split(/[\s,]+/)) {
    const trimmed = t.trim();
    if (!/^\d{5}$/.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.sort();
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

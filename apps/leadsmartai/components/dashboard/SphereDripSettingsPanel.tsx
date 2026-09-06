"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Per-agent sphere-drip toggle. Pairs with the both_high cadence
 * shipped in #167 (enrollment) and #169 (send pipeline). When this is
 * off, the cron cohort skips this agent — no auto-enrollments, no
 * step-advances, no drafts created.
 *
 * The panel surfaces:
 *   * The toggle itself (defaults to false; explicit opt-in)
 *   * An optional notes field ("paused while on vacation")
 *   * Source attribution — DB / env / default — so an agent
 *     understands WHY they're currently enabled when they didn't
 *     touch the toggle (env allowlist still active)
 *   * "DB + env" hint when both are configured (so the agent knows
 *     toggling off is final — env won't re-enable them)
 */

type EffectivePrefs = {
  agentId: string;
  enabled: boolean;
  notes: string | null;
  updatedAt: string | null;
  source: "db" | "env" | "default";
  hasDbRow: boolean;
  inEnvAllowlist: boolean;
};

const SOURCE_TONE: Record<EffectivePrefs["source"], { label: string; tone: string }> = {
  db: {
    label: "Saved",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  env: {
    label: "Pilot allowlist",
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  default: {
    label: "Off (default)",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
  },
};

export default function SphereDripSettingsPanel() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [prefs, setPrefs] = useState<EffectivePrefs | null>(null);
  const [enabledDraft, setEnabledDraft] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent/sphere-drip-prefs", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        prefs?: EffectivePrefs;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok || !data.prefs) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setPrefs(data.prefs);
      setEnabledDraft(data.prefs.enabled);
      setNotesDraft(data.prefs.notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent/sphere-drip-prefs", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: enabledDraft,
          notes: notesDraft.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        prefs?: EffectivePrefs;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok || !data.prefs) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setPrefs(data.prefs);
      setEnabledDraft(data.prefs.enabled);
      setNotesDraft(data.prefs.notes ?? "");
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [enabledDraft, notesDraft]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.sphereDrip.title")}</h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Auto-enrolls high-leverage past clients and sphere contacts (the
            &ldquo;both-high&rdquo; cohort) into a 6-touch nurture cadence over ~30 days.
            SMS + email mix; respects your review policy and DNC flags.
          </p>
        </div>
        {prefs ? <SourcePill source={prefs.source} /> : null}
      </header>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enabledDraft}
                onChange={(e) => setEnabledDraft(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-slate-900"
              />
              <span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.sphereDrip.enable")}</span>
                <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{t("pages.sphereDrip.enableHint")}</span>
              </span>
            </label>

            {prefs?.inEnvAllowlist && prefs.source === "db" && !enabledDraft ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("pages.sphereDrip.optOutWins")}</div>
            ) : null}

            {prefs?.source === "env" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("pages.sphereDrip.pilotNote")}</div>
            ) : null}

            <div>
              <label htmlFor="drip-notes" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.sphereDrip.notes")}<span className="font-normal text-slate-400">(optional)</span>
              </label>
              <p className="mt-0.5 text-xs text-slate-500">{t("pages.dashFragments.freeTextReminder")}{" "}
                <em>&ldquo;paused for vacation, resume Aug 15&rdquo;</em>.
              </p>
              <textarea
                id="drip-notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("pages.sphereDrip.notesPlaceholder")}
                className="mt-2 block w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-h-[20px] text-xs">
                {error ? (
                  <span className="text-rose-600">{error}</span>
                ) : savedAt && Date.now() - savedAt < 4000 ? (
                  <span className="text-emerald-600">{t("pages.sphereDrip.saved")}</span>
                ) : prefs?.updatedAt ? (
                  <span className="text-slate-400">
                    {t("pages.sphereDrip.lastUpdated", { date: formatDate(prefs.updatedAt, locale) })}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? t("common:status.saving") : t("common:actions.save")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SourcePill({ source }: { source: EffectivePrefs["source"] }) {
  const { t } = useTranslation("dashboard");
  const meta = SOURCE_TONE[source];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.tone}`}
      title={t("pages.sphereDrip.sourceTip")}
    >
      {meta.label}
    </span>
  );
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

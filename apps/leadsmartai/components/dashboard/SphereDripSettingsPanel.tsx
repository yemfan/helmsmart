"use client";

import { useCallback, useEffect, useState } from "react";

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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Sphere drip cadence
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
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
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enabledDraft}
                onChange={(e) => setEnabledDraft(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>
                <span className="text-sm font-semibold text-slate-900">
                  Enable sphere drip for my account
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  When on, the daily cron auto-enrolls eligible contacts and the
                  hourly send pipeline advances the cadence. Drafts honor your
                  review policy.
                </span>
              </span>
            </label>

            {prefs?.inEnvAllowlist && prefs.source === "db" && !enabledDraft ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You&apos;re also in the pilot allowlist. Saving this off will
                still skip you — your explicit opt-out wins.
              </div>
            ) : null}

            {prefs?.source === "env" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You&apos;re currently enrolled via the pilot allowlist (env).
                Save this form to lock in your preference — once saved, env
                changes won&apos;t affect you.
              </div>
            ) : null}

            <div>
              <label htmlFor="drip-notes" className="block text-sm font-semibold text-slate-900">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Free-text reminder for yourself — e.g.{" "}
                <em>&ldquo;paused for vacation, resume Aug 15&rdquo;</em>.
              </p>
              <textarea
                id="drip-notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Anything you want future-you to know."
                className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-h-[20px] text-xs">
                {error ? (
                  <span className="text-rose-600">{error}</span>
                ) : savedAt && Date.now() - savedAt < 4000 ? (
                  <span className="text-emerald-600">Saved.</span>
                ) : prefs?.updatedAt ? (
                  <span className="text-slate-400">
                    Last updated {formatDate(prefs.updatedAt)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SourcePill({ source }: { source: EffectivePrefs["source"] }) {
  const meta = SOURCE_TONE[source];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.tone}`}
      title="Source of the current enrollment status"
    >
      {meta.label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

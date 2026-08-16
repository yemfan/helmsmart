"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The social auto-post controller: what gets posted, where, how often, when,
 * and who signs off.
 *
 * Every "which/when" control has an explicit unset state meaning "no
 * preference", which is what the engine defaults to. That's why platforms and
 * topics read "All connected accounts" / "Any topic" when nothing is ticked
 * rather than showing an empty, broken-looking selection.
 *
 * Turning on AI automation doesn't erase the manual settings — it overrides
 * them for the period and leaves them intact underneath, so switching back
 * restores exactly what the owner had chosen.
 */

type Mode = "review" | "assisted" | "auto";

type Config = {
  mode: string;
  postsPerWeek: number;
  platforms: string[] | null;
  contentCategories: string[] | null;
  includeTimely: boolean;
  postsPerDay: number | null;
  postDays: number[] | null;
  postHourUtc: number | null;
  aiManaged: boolean;
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
};

const CATEGORY_LABELS: Record<string, string> = {
  buying: "Buying",
  selling: "Selling",
  financing: "Financing",
  market_basics: "Market basics",
  pitfalls: "Pitfalls to avoid",
  how_to: "How-to",
  staging: "Staging",
  negotiation: "Negotiation",
  brand: "About my business",
};

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const APPROVAL_OPTIONS: { value: Mode; label: string; blurb: string }[] = [
  {
    value: "review",
    label: "I approve every post",
    blurb:
      "Your week is written and scheduled at the right times, then held. Nothing publishes until you approve it.",
  },
  {
    value: "assisted",
    label: "Boss Assistant approves",
    blurb:
      "The Boss fact-checks each post against what your business actually does. Verified posts are scheduled; anything it can't verify is held for you, with the reason.",
  },
  {
    value: "auto",
    label: "Full autopilot",
    blurb:
      "Written, scheduled and published with no check — the only option where something reaches your feed that nobody has read.",
  },
];

/** The stored hour is UTC; nobody thinks in UTC, so the picker is local time. */
function utcHourToLocal(utcHour: number): number {
  const offsetHours = new Date().getTimezoneOffset() / 60; // minutes BEHIND UTC
  return ((utcHour - offsetHours) % 24 + 24) % 24;
}
function localHourToUtc(localHour: number): number {
  const offsetHours = new Date().getTimezoneOffset() / 60;
  return ((localHour + offsetHours) % 24 + 24) % 24;
}
function formatLocalHour(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export default function SocialAutopilotController() {
  const { t } = useTranslation("dashboard");
  const [config, setConfig] = useState<Config | null>(null);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/social/autopilot");
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        setConfig(json.config as Config);
        setPlatformOptions(json.options?.platforms ?? []);
        setCategoryOptions(json.options?.contentCategories ?? []);
      } catch {
        setError(t("pages.socialAutopilot.loadFailed"));
      }
    })();
  }, []);

  const save = useCallback(
    async (patch: Partial<Config>) => {
      const prev = config;
      setConfig((c) => (c ? { ...c, ...patch } : c));
      setSaving(true);
      setError(null);
      setSaved(false);
      try {
        const res = await fetch("/api/social/autopilot", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error);
        // Render what actually persisted — the server normalises empty
        // selections back to "no preference".
        setConfig(json.config as Config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setConfig(prev); // never show a setting we failed to save
        setError(t("pages.socialAutopilot.saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [config],
  );

  if (!config) {
    return <p className="text-xs text-gray-500">{error ?? "Loading…"}</p>;
  }

  const aiOn = config.aiManaged;
  /** AI automation owns the mechanics; approval stays the owner's call. */
  const dim = aiOn ? "pointer-events-none opacity-45" : "";

  function toggleInList(list: string[] | null, value: string): string[] | null {
    const current = list ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    // Empty means "no preference" — the engine reads null as "all".
    return next.length > 0 ? next : null;
  }

  function toggleDay(list: number[] | null, value: number): number[] | null {
    const current = list ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value].sort((a, b) => a - b);
    return next.length > 0 ? next : null;
  }

  return (
    <div className="space-y-6">
      {/* ── AI automation ───────────────────────────────────────────── */}
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
          aiOn
            ? "border-[#0072ce] bg-blue-50/50 ring-1 ring-[#0072ce]"
            : "border-gray-200 bg-white hover:bg-gray-50"
        }`}
      >
        <input
          type="checkbox"
          checked={aiOn}
          disabled={saving}
          onChange={() => save({ aiManaged: !aiOn })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0072ce]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">
            Let AI run my social media
          </span>
          <span className="mt-0.5 block text-xs text-gray-600">
            The AI decides how often to post, which of your connected accounts to use,
            which topics to cover, and what time to publish — and re-plans every week.
            Your approval setting below still applies.
          </span>
        </span>
      </label>

      {aiOn && (
        <p className="-mt-3 text-[11px] text-gray-500">
          AI automation is on, so the settings below are being chosen for you each week.
          Turn it off to set them yourself — your choices are kept.
        </p>
      )}

      {/* ── Where ───────────────────────────────────────────────────── */}
      <section className={dim}>
        <h3 className="text-sm font-semibold text-gray-900">{t("pages.socialAutopilot.whereToPost")}</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          {config.platforms === null
            ? "All connected accounts."
            : "Only the accounts you tick."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {platformOptions.map((p) => {
            const on = config.platforms === null || config.platforms.includes(p);
            const explicit = config.platforms !== null && config.platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                disabled={saving}
                onClick={() => save({ platforms: toggleInList(config.platforms, p) })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  explicit
                    ? "border-[#0072ce] bg-[#0072ce] text-white"
                    : on
                      ? "border-gray-300 bg-white text-gray-700"
                      : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                {PLATFORM_LABELS[p] ?? p}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── What ────────────────────────────────────────────────────── */}
      <section className={dim}>
        <h3 className="text-sm font-semibold text-gray-900">{t("pages.socialAutopilot.whatToPost")}</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          {config.contentCategories === null
            ? "Any topic from your content library."
            : "Only the topics you tick."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categoryOptions.map((c) => {
            const explicit =
              config.contentCategories !== null && config.contentCategories.includes(c);
            const on = config.contentCategories === null || explicit;
            return (
              <button
                key={c}
                type="button"
                disabled={saving}
                onClick={() =>
                  save({ contentCategories: toggleInList(config.contentCategories, c) })
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  explicit
                    ? "border-[#0072ce] bg-[#0072ce] text-white"
                    : on
                      ? "border-gray-300 bg-white text-gray-700"
                      : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                {CATEGORY_LABELS[c] ?? c}
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={config.includeTimely}
            disabled={saving}
            onChange={() => save({ includeTimely: !config.includeTimely })}
            className="h-4 w-4 accent-[#0072ce]"
          />
          <span className="text-xs text-gray-700">
            Include one market-news post each week
          </span>
        </label>
      </section>

      {/* ── How often ───────────────────────────────────────────────── */}
      <section className={dim}>
        <h3 className="text-sm font-semibold text-gray-900">{t("pages.socialAutopilot.howOften")}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-medium text-gray-700">{t("pages.socialAutopilot.postsPerWeek")}</span>
            <select
              value={config.postsPerWeek}
              disabled={saving}
              onChange={(e) => save({ postsPerWeek: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "post" : "posts"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-gray-700">{t("pages.socialAutopilot.maxPerDay")}</span>
            <select
              value={config.postsPerDay ?? ""}
              disabled={saving}
              onChange={(e) =>
                save({ postsPerDay: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">1 (spread out)</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} per day
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <span className="block text-xs font-medium text-gray-700">{t("pages.socialAutopilot.daysToPost")}</span>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {config.postDays === null
              ? "Spread automatically across the week."
              : "Only the days you pick."}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const explicit = config.postDays !== null && config.postDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={saving}
                  onClick={() => save({ postDays: toggleDay(config.postDays, d.value) })}
                  className={`w-12 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                    explicit
                      ? "border-[#0072ce] bg-[#0072ce] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-3 block max-w-[220px]">
          <span className="block text-xs font-medium text-gray-700">{t("pages.socialAutopilot.timeOfDay")}</span>
          <select
            value={config.postHourUtc === null ? "" : utcHourToLocal(config.postHourUtc)}
            disabled={saving}
            onChange={(e) =>
              save({
                postHourUtc:
                  e.target.value === "" ? null : localHourToUtc(Number(e.target.value)),
              })
            }
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">{t("pages.socialAutopilot.defaultTime")}</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {formatLocalHour(h)} your time
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* ── Who approves ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900">{t("pages.socialAutopilot.whoApproves")}</h3>
        <div className="mt-2 space-y-2">
          {APPROVAL_OPTIONS.map((opt) => {
            // Legacy 'ask' (drafts-only) has no control here; show it as the
            // closest equivalent rather than an empty selection.
            const current = config.mode === "ask" ? "review" : config.mode;
            const active = current === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                  active
                    ? "border-[#0072ce] bg-blue-50/40 ring-1 ring-[#0072ce]"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                } ${saving ? "opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="social-approval"
                  value={opt.value}
                  checked={active}
                  disabled={saving}
                  onChange={() => save({ mode: opt.value })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#0072ce]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-600">{opt.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-700">{t("pages.socialAutopilot.saved")}</p>}

      <p className="text-[11px] text-gray-500">
        Applies to social posts only. Live calls and text replies can&apos;t wait for
        approval, so they&apos;re governed by their own settings on each assistant.
      </p>
    </div>
  );
}

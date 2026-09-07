"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AI_TEAM, type AssistantType } from "@/lib/closeboss/team";
import { AssistantAvatar, AssistantAvatarPicker } from "@/components/closeboss/AssistantAvatar";

type AssistantRow = {
  id: string;
  type: AssistantType;
  name: string;
  avatar_id: string;
  avatar_url: string | null;
  status: "active" | "paused";
  description: string | null;
  enabled_skills: string[];
};

type SkillRow = { key: string; name: string; description: string; category: string };

type Performance = {
  windowDays: number;
  assistants: { type: AssistantType; activities: number; needsAttention: number; series: number[] }[];
  calls: { answered: number; missed: number; recovered: number; outbound: number; avgDurationSeconds: number | null };
  recommendations: { open: number; completed: number; dismissed: number };
};

export default function AiTeamClient() {
  const { t } = useTranslation("dashboard");
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which assistant's avatar editor is open.
  const [editing, setEditing] = useState<AssistantType | null>(null);

  const load = useCallback(async () => {
    const [res, perfRes] = await Promise.all([
      fetch("/api/dashboard/closeboss/team").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/performance").then((r) => r.json()).catch(() => ({})),
    ]);
    if (res?.ok) {
      setAssistants((res.assistants ?? []) as AssistantRow[]);
      setSkills((res.skills ?? []) as SkillRow[]);
    } else {
      setError(res?.error ?? t("aiTeam.loadFailed"));
    }
    if (perfRes?.ok) setPerf(perfRes as Performance);
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(
    async (
      type: AssistantType,
      body: { status?: "active" | "paused"; enabledSkills?: string[]; avatarId?: string },
    ) => {
      setSaving(type);
      setError(null);
      const res = await fetch("/api/dashboard/closeboss/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...body }),
      }).then((r) => r.json()).catch(() => ({}));
      if (res?.ok && res.assistant) {
        setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
      } else {
        setError(res?.error ?? t("aiTeam.saveFailed"));
      }
      setSaving(null);
    },
    [t],
  );

  const uploadAvatar = useCallback(async (type: AssistantType, file: File) => {
    setSaving(type);
    setError(null);
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file);
    const res = await fetch("/api/dashboard/closeboss/assistant-avatar", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => ({}));
    if (res?.ok && res.assistant) {
      setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
    } else {
      setError(res?.error ?? t("aiTeam.uploadFailed"));
    }
    setSaving(null);
  }, []);

  const removeAvatar = useCallback(async (type: AssistantType) => {
    setSaving(type);
    setError(null);
    const res = await fetch("/api/dashboard/closeboss/assistant-avatar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    })
      .then((r) => r.json())
      .catch(() => ({}));
    if (res?.ok && res.assistant) {
      setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
    } else {
      setError(res?.error ?? t("aiTeam.removeFailed"));
    }
    setSaving(null);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t("aiTeam.eyebrow")}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100">{t("aiTeam.heading")}</h1>
        <p className="text-sm text-slate-500">{t("aiTeam.intro")}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      )}

      {/* ── AI team performance (last 30 days, from real logs) ── */}
      {perf && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("aiTeam.perfHeading")}{" "}
            <span className="font-normal text-slate-500">
              {t("aiTeam.perfWindow", { days: perf.windowDays })}
            </span>
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PerfStat
              label={t("aiTeam.callsAnswered")}
              value={perf.calls.answered}
              hint={
                perf.calls.avgDurationSeconds != null
                  ? t("aiTeam.avgMinutes", { minutes: Math.round(perf.calls.avgDurationSeconds / 60) })
                  : undefined
              }
            />
            <PerfStat
              label={t("aiTeam.missedRecovered")}
              value={`${perf.calls.recovered}/${perf.calls.missed}`}
              hint={t("aiTeam.missedHint")}
            />
            <PerfStat label={t("aiTeam.outboundCalls")} value={perf.calls.outbound} />
            <PerfStat
              label={t("aiTeam.prioritiesCompleted")}
              value={perf.recommendations.completed}
              hint={t("aiTeam.prioritiesHint", {
                open: perf.recommendations.open,
                dismissed: perf.recommendations.dismissed,
              })}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {perf.assistants
              .filter((a) => a.type !== "boss_assistant")
              .map((a) => {
                const def = AI_TEAM.find((d) => d.type === a.type);
                const max = Math.max(1, ...a.series);
                return (
                  <div key={a.type} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{def?.displayName ?? a.type}</p>
                    <p className="text-[10px] text-slate-500">
                      {t("aiTeam.activities", { count: a.activities })}
                      {a.needsAttention > 0 ? t("aiTeam.neededYou", { count: a.needsAttention }) : ""}
                    </p>
                    <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden>
                      {a.series.map((v, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${v > 0 ? "bg-blue-500/80" : "bg-slate-100 dark:bg-slate-800"}`}
                          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                          title={t("aiTeam.barTooltip", { count: v, day: i + 1 })}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">{t("aiTeam.activityWindow")}</p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("aiTeam.loading")}</p>
      ) : (
        <div className="space-y-4">
          {assistants.map((a) => {
            const def = AI_TEAM.find((d) => d.type === a.type);
            const rosterSkills = new Set(def?.skills ?? []);
            // Every assistant with skills on its roster can configure them,
            // Max included. He used to be excluded on the grounds that the
            // Captain only coordinates — but coordinating is the work, and it
            // was neither inspectable nor switchable.
            const configurable = rosterSkills.size > 0;
            return (
              <section key={a.type} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AssistantAvatar id={a.avatar_id} url={a.avatar_url} size={44} alt={a.name} className="mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{def?.displayName ?? a.name}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600 dark:text-slate-400"}`}>
                          {t(a.status === "active" ? "aiTeam.statusActive" : "aiTeam.statusPaused")}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t(`aiTeam.role.${a.type}`, { defaultValue: def?.name ?? "" })}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t(`aiTeam.personality.${a.type}`, {
                          defaultValue: def?.personality ?? def?.mission ?? "",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing((cur) => (cur === a.type ? null : a.type))}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {editing === a.type ? t("aiTeam.close") : t("aiTeam.editAvatar")}
                    </button>
                    {def?.href && (
                      <Link href={def.href} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        {t("aiTeam.viewDashboard")}
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={saving === a.type}
                      onClick={() => void patch(a.type, { status: a.status === "active" ? "paused" : "active" })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm disabled:opacity-50 ${a.status === "active" ? "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" : "bg-[#0072ce] text-white hover:bg-[#005ca8]"}`}
                    >
                      {saving === a.type
                        ? t("aiTeam.saving")
                        : a.status === "active"
                          ? t("aiTeam.pause")
                          : t("aiTeam.activate")}
                    </button>
                  </div>
                </div>

                {editing === a.type && (
                  <div className="mt-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("aiTeam.avatar")}
                    </p>
                    <div className="mb-3 flex items-center gap-2">
                      <label className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        {saving === a.type ? t("aiTeam.uploading") : t("aiTeam.uploadPhoto")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={saving === a.type}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void uploadAvatar(a.type, f);
                          }}
                        />
                      </label>
                      {a.avatar_url && (
                        <button
                          type="button"
                          disabled={saving === a.type}
                          onClick={() => void removeAvatar(a.type)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          {t("aiTeam.removePhoto")}
                        </button>
                      )}
                      <span className="text-[10px] text-slate-500">{t("aiTeam.photoHint")}</span>
                    </div>
                    <AssistantAvatarPicker
                      value={a.avatar_url ? undefined : a.avatar_id}
                      disabled={saving === a.type}
                      onSelect={(id) => void patch(a.type, { avatarId: id })}
                    />
                  </div>
                )}

                {configurable && (
                  <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("aiTeam.skills")}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {skills
                        .filter((s) => rosterSkills.has(s.key))
                        .map((s) => {
                          const enabled = a.enabled_skills.includes(s.key);
                          return (
                            <label key={s.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={saving === a.type}
                                onChange={() => {
                                  const next = enabled
                                    ? a.enabled_skills.filter((k) => k !== s.key)
                                    : [...a.enabled_skills, s.key];
                                  void patch(a.type, { enabledSkills: next });
                                }}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-medium text-slate-900 dark:text-slate-100">
                                  {t(`aiTeam.skill.${s.key}.name`, { defaultValue: s.name })}
                                </span>
                                <span className="block text-[10px] leading-snug text-slate-500">
                                  {t(`aiTeam.skill.${s.key}.desc`, { defaultValue: s.description })}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PerfStat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

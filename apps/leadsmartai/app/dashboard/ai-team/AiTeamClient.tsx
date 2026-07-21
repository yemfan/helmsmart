"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AI_TEAM, type AssistantType } from "@/lib/realtyboss/team";
import { AssistantAvatar, AssistantAvatarPicker } from "@/components/realtyboss/AssistantAvatar";

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
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which assistant's name/avatar editor is open, + the in-progress name draft.
  const [editing, setEditing] = useState<AssistantType | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    const [res, perfRes] = await Promise.all([
      fetch("/api/dashboard/realtyboss/team").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/performance").then((r) => r.json()).catch(() => ({})),
    ]);
    if (res?.ok) {
      setAssistants((res.assistants ?? []) as AssistantRow[]);
      setSkills((res.skills ?? []) as SkillRow[]);
    } else {
      setError(res?.error ?? "Could not load your AI team.");
    }
    if (perfRes?.ok) setPerf(perfRes as Performance);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(
    async (
      type: AssistantType,
      body: { status?: "active" | "paused"; enabledSkills?: string[]; name?: string; avatarId?: string },
    ) => {
      setSaving(type);
      setError(null);
      const res = await fetch("/api/dashboard/realtyboss/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...body }),
      }).then((r) => r.json()).catch(() => ({}));
      if (res?.ok && res.assistant) {
        setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
      } else {
        setError(res?.error ?? "Could not save — try again.");
      }
      setSaving(null);
    },
    [],
  );

  const uploadAvatar = useCallback(async (type: AssistantType, file: File) => {
    setSaving(type);
    setError(null);
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file);
    const res = await fetch("/api/dashboard/realtyboss/assistant-avatar", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => ({}));
    if (res?.ok && res.assistant) {
      setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
    } else {
      setError(res?.error ?? "Upload failed — try again.");
    }
    setSaving(null);
  }, []);

  const removeAvatar = useCallback(async (type: AssistantType) => {
    setSaving(type);
    setError(null);
    const res = await fetch("/api/dashboard/realtyboss/assistant-avatar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    })
      .then((r) => r.json())
      .catch(() => ({}));
    if (res?.ok && res.assistant) {
      setAssistants((prev) => prev.map((a) => (a.type === type ? (res.assistant as AssistantRow) : a)));
    } else {
      setError(res?.error ?? "Could not remove — try again.");
    }
    setSaving(null);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">CloseBoss</p>
        <h1 className="mt-0.5 text-xl font-semibold text-gray-900">Manage Your AI Team</h1>
        <p className="text-sm text-gray-500">
          Pause an assistant to hide its recommendations and activity from your Boss Assistant
          dashboard, and choose which skills each assistant works with.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      )}

      {/* ── AI team performance (last 30 days, from real logs) ── */}
      {perf && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Performance <span className="font-normal text-gray-400">· last {perf.windowDays} days</span>
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PerfStat label="Calls answered" value={perf.calls.answered} hint={perf.calls.avgDurationSeconds != null ? `avg ${Math.round(perf.calls.avgDurationSeconds / 60)}m` : undefined} />
            <PerfStat label="Missed calls recovered" value={`${perf.calls.recovered}/${perf.calls.missed}`} hint="text-back sent / missed" />
            <PerfStat label="Outbound AI calls" value={perf.calls.outbound} />
            <PerfStat label="Priorities completed" value={perf.recommendations.completed} hint={`${perf.recommendations.open} open · ${perf.recommendations.dismissed} dismissed`} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {perf.assistants
              .filter((a) => a.type !== "boss_assistant")
              .map((a) => {
                const def = AI_TEAM.find((d) => d.type === a.type);
                const custName = assistants.find((x) => x.type === a.type)?.name;
                const max = Math.max(1, ...a.series);
                return (
                  <div key={a.type} className="rounded-lg border border-gray-100 p-3">
                    <p className="text-xs font-medium text-gray-900">{custName ?? def?.name ?? a.type}</p>
                    <p className="text-[10px] text-gray-500">
                      {a.activities} activit{a.activities === 1 ? "y" : "ies"}
                      {a.needsAttention > 0 ? ` · ${a.needsAttention} needed you` : ""}
                    </p>
                    <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden>
                      {a.series.map((v, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${v > 0 ? "bg-blue-500/80" : "bg-gray-100"}`}
                          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                          title={`${v} on day ${i + 1}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">activity · last 14 days</p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading your AI team…</p>
      ) : (
        <div className="space-y-4">
          {assistants.map((a) => {
            const def = AI_TEAM.find((d) => d.type === a.type);
            const rosterSkills = new Set(def?.skills ?? []);
            // Boss Assistant has no attachable skills — it coordinates the others.
            const configurable = a.type !== "boss_assistant";
            return (
              <section key={a.type} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AssistantAvatar id={a.avatar_id} url={a.avatar_url} size={44} alt={a.name} className="mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-gray-900">{a.name}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                          {a.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{a.description ?? def?.mission ?? ""}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing((cur) => (cur === a.type ? null : a.type));
                        setNameDraft(a.name);
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      {editing === a.type ? "Close" : "Edit name & avatar"}
                    </button>
                    {def && def.type !== "boss_assistant" && (
                      <Link href={def.href} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        View dashboard
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={saving === a.type}
                      onClick={() => void patch(a.type, { status: a.status === "active" ? "paused" : "active" })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm disabled:opacity-50 ${a.status === "active" ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" : "bg-gray-900 text-white hover:bg-gray-700"}`}
                    >
                      {saving === a.type ? "Saving…" : a.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </div>
                </div>

                {editing === a.type && (
                  <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Name
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        maxLength={80}
                        placeholder={def?.name ?? "Assistant name"}
                        className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0072ce]"
                      />
                      <button
                        type="button"
                        disabled={saving === a.type || !nameDraft.trim() || nameDraft.trim() === a.name}
                        onClick={() => void patch(a.type, { name: nameDraft.trim() })}
                        className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#005fa8] disabled:opacity-50"
                      >
                        Save name
                      </button>
                    </div>
                    <p className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Avatar
                    </p>
                    <div className="mb-3 flex items-center gap-2">
                      <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        {saving === a.type ? "Uploading…" : "Upload photo"}
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
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                          Remove photo
                        </button>
                      )}
                      <span className="text-[10px] text-gray-400">JPG/PNG/WEBP, ≤5 MB — or pick one below</span>
                    </div>
                    <AssistantAvatarPicker
                      value={a.avatar_url ? undefined : a.avatar_id}
                      disabled={saving === a.type}
                      onSelect={(id) => void patch(a.type, { avatarId: id })}
                    />
                  </div>
                )}

                {configurable && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Skills</p>
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {skills
                        .filter((s) => rosterSkills.has(s.key))
                        .map((s) => {
                          const enabled = a.enabled_skills.includes(s.key);
                          return (
                            <label key={s.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-100 px-2.5 py-2 hover:bg-gray-50">
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
                                <span className="block text-xs font-medium text-gray-900">{s.name}</span>
                                <span className="block text-[10px] leading-snug text-gray-500">{s.description}</span>
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
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

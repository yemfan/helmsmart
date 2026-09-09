"use client";

/**
 * Social topic pool UI. Generate AI topics from the business profile, review
 * (approve / dismiss), and add your own. Approved topics feed post scheduling.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  generateSocialTopics,
  setTopicStatus,
  addManualTopic,
  applyApprovedTopicsToSchedule,
  type SocialTopic,
} from "@/lib/actions/topics";

export function SocialTopicsPanel({ initialTopics }: { initialTopics: SocialTopic[] }) {
  const { t } = useTranslation("marketing");
  const [topics, setTopics] = useState<SocialTopic[]>(initialTopics);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [open, setOpen] = useState(initialTopics.length > 0);
  const [sched, setSched] = useState<{ scheduled: number; enabled: boolean } | null>(null);
  const [pending, start] = useTransition();

  const suggested = topics.filter((topic) => topic.status === "suggested");
  const approved = topics.filter((topic) => topic.status === "approved");

  function schedule() {
    setError(null);
    setSched(null);
    start(async () => {
      const res = await applyApprovedTopicsToSchedule();
      if (!res.ok) {
        setError(res.error ?? t("social.topics.scheduleError"));
        return;
      }
      setSched({ scheduled: res.scheduled ?? 0, enabled: res.enabled ?? false });
    });
  }

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateSocialTopics(8);
      if (!res.ok) {
        setError(res.error ?? t("social.topics.genericError"));
        return;
      }
      setOpen(true);
      setTopics((prev) => [...(res.topics ?? []), ...prev]);
    });
  }

  function update(id: string, status: SocialTopic["status"]) {
    // Optimistic: archived drops off the list; approve/re-suggest flips status.
    setTopics((prev) =>
      status === "archived"
        ? prev.filter((topic) => topic.id !== id)
        : prev.map((topic) => (topic.id === id ? { ...topic, status } : topic)),
    );
    start(async () => {
      await setTopicStatus(id, status);
    });
  }

  function add() {
    const text = manual.trim();
    if (!text) return;
    setManual("");
    setTopics((prev) => [
      {
        id: `tmp-${text}-${prev.length}`,
        topic: text.slice(0, 160),
        theme: null,
        source: "manual",
        status: "approved",
        used_count: 0,
        created_at: "",
      },
      ...prev,
    ]);
    start(async () => {
      await addManualTopic(text);
    });
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <span
            className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          <span className="text-sm font-semibold text-slate-900">{t("social.topics.title")}</span>
          <span className="text-xs text-slate-500">
            {t("social.topics.subtitle")}
          </span>
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white
                     hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? t("common:status.generating") : t("social.topics.generate")}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
              {error}
            </p>
          )}

          {/* Suggested — need review */}
          {suggested.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("social.topics.suggestedHeading")}
              </p>
              <ul className="space-y-1.5">
                {suggested.map((topic) => (
                  <li
                    key={topic.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <span className="text-sm text-slate-800">{topic.topic}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => update(topic.id, "approved")}
                        disabled={pending}
                        className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {t("social.topics.approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => update(topic.id, "archived")}
                        disabled={pending}
                        className="rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                      >
                        {t("social.topics.dismiss")}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Approved — will feed scheduling */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("social.topics.approvedHeading")}
              </p>
              {approved.length > 0 && (
                <button
                  type="button"
                  onClick={schedule}
                  disabled={pending}
                  className="shrink-0 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                >
                  {t("social.topics.addToSchedule")}
                </button>
              )}
            </div>
            {sched && (
              <p className="mb-2 text-xs text-emerald-700">
                {t("social.topics.added", { count: sched.scheduled })}
                {!sched.enabled && (
                  <>
                    {" "}
                    <Link href="/settings?tab=marketing" className="underline">
                      {t("social.topics.turnOnAutopilot")}
                    </Link>
                  </>
                )}
              </p>
            )}
            {approved.length === 0 ? (
              <p className="text-xs text-slate-400">
                {t("social.topics.empty")}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {approved.map((topic) => (
                  <li
                    key={topic.id}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
                  >
                    {topic.topic}
                    <button
                      type="button"
                      onClick={() => update(topic.id, "archived")}
                      disabled={pending}
                      title={t("social.topics.remove")}
                      className="text-emerald-400 hover:text-emerald-700 disabled:opacity-60"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add manual */}
          <div className="flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              maxLength={160}
              placeholder={t("social.topics.addPlaceholder")}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={add}
              disabled={pending || !manual.trim()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t("social.topics.add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

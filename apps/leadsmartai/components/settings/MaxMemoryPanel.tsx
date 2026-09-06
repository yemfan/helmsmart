"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { LoadingText } from "@/components/ui/LoadingText";
import type { MemoryNote } from "@/lib/boss/memory/pure";

/**
 * Settings › AI team › What Max remembers.
 *
 * The realtor's window into Max's notebook: every durable note, who wrote it
 * (Max from a conversation, or them here), remove any, add one. Transparency
 * is what makes automatic memory safe — a wrong note is one click from gone.
 */
export default function MaxMemoryPanel() {
  const { t, i18n } = useTranslation("dashboard");
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedAt, setAddedAt] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/boss/memories", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; notes?: MemoryNote[]; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || t("settings.maxMemory.loadFailed"));
      setNotes(body.notes ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("settings.maxMemory.loadFailed"));
      setNotes([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (addedAt == null) return;
    const id = setTimeout(() => setAddedAt(null), 2500);
    return () => clearTimeout(id);
  }, [addedAt]);

  async function add() {
    const content = draft.trim();
    if (!content || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/dashboard/boss/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; note?: MemoryNote; error?: string };
      if (!res.ok || !body.ok || !body.note) throw new Error(body.error || t("settings.maxMemory.addFailed"));
      setNotes((prev) => [body.note as MemoryNote, ...(prev ?? [])]);
      setDraft("");
      setAddedAt(Date.now());
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t("settings.maxMemory.addFailed"));
    } finally {
      setAdding(false);
    }
  }

  async function remove(note: MemoryNote) {
    setRowError(null);
    // Optimistic; put it back with the reason if the archive is refused.
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== note.id));
    try {
      const res = await fetch(`/api/dashboard/boss/memories?id=${encodeURIComponent(note.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || t("settings.maxMemory.removeFailed"));
    } catch (e) {
      setNotes((prev) => [note, ...(prev ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      setRowError(e instanceof Error ? e.message : t("settings.maxMemory.removeFailed"));
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === "zh-Hans" ? "zh-Hans-CN" : "en-US", { month: "short", day: "numeric" });

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("settings.maxMemory.placeholder")}
          aria-label={t("settings.maxMemory.add")}
          maxLength={400}
          className="min-w-[240px] flex-1"
        />
        <button
          type="submit"
          disabled={adding || !draft.trim()}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {adding ? t("settings.maxMemory.adding") : addedAt ? t("settings.maxMemory.added") : t("settings.maxMemory.add")}
        </button>
        {addError && (
          <p className="basis-full text-xs text-rose-600" role="alert">
            {addError}
          </p>
        )}
      </form>

      {notes === null ? (
        <LoadingText />
      ) : loadError ? (
        <p className="text-xs text-rose-600" role="alert">
          {loadError}
        </p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.maxMemory.empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900 dark:text-slate-100">{n.content}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                    {t(`settings.maxMemory.kinds.${n.kind}`)}
                  </span>
                  <span className="ml-2">{n.source === "max" ? t("settings.maxMemory.byMax") : t("settings.maxMemory.byYou")}</span>
                  <span className="ml-2">{when(n.created_at)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(n)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-700 dark:hover:bg-slate-800"
              >
                {t("settings.maxMemory.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rowError && (
        <p className="text-xs text-rose-600" role="alert">
          {rowError}
        </p>
      )}
    </div>
  );
}

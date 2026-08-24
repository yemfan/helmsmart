"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Choose which newly-granted Facebook Pages to connect.
 *
 * Facebook's Page grant is cumulative: the picker on Facebook's side shows a
 * fresh selection, but the token it returns carries every Page ever granted to
 * this app. Connecting used to link all of them, so ticking one Page could
 * connect five — including Pages disconnected here earlier, which came back on
 * the next connect.
 *
 * New Pages now arrive as "awaiting_selection" and wait here. Nothing starts
 * with a tick: connecting a Page should be something the agent did, not
 * something that happened to them.
 */

type PendingPage = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string | null;
  account_picture_url: string | null;
  ig_business_username: string | null;
};

export default function MetaPageSelector({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation("web_generate_leads_clients");
  const [pages, setPages] = useState<PendingPage[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leads-gen/connect/meta/select");
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; pages?: PendingPage[] };
      setPages(b.ok && Array.isArray(b.pages) ? b.pages : []);
    } catch {
      setPages([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  }

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads-gen/connect/meta/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keep: [...chosen] }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? t("connect.meta.select_failed"));
        return;
      }
      setPages([]);
      setChosen(new Set());
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("connect.meta.select_failed"));
    } finally {
      setBusy(false);
    }
  }, [chosen, onDone, t]);

  const list = pages ?? [];
  if (!list.length) return null;

  return (
    <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{t("connect.meta.select_title")}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-600">{t("connect.meta.select_intro")}</p>

      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                type="checkbox"
                checked={chosen.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-brand-accent"
              />
              {p.account_picture_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.account_picture_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                  {(p.fb_page_name ?? "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {p.fb_page_name ?? t("connect.meta.page_fallback")}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {p.ig_business_username ? `IG @${p.ig_business_username} · ` : ""}
                  {p.fb_page_id ?? ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {chosen.size === 0
            ? t("connect.meta.select_none_cta")
            : t("connect.meta.select_cta", { count: chosen.size })}
        </button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      <p className="mt-2 text-[11px] leading-5 text-slate-500">{t("connect.meta.select_revoke_note")}</p>
    </div>
  );
}

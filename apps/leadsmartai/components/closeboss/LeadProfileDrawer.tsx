"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { HubJourney } from "./HubJourney";

/**
 * Lead profile drawer — the constitution's lead experience: a PERSON
 * (story, relationship, what the team has done, what to do next), not
 * a database record. Opens over the Boss dashboard so the Realtor
 * never leaves the command center for a quick read on someone.
 */

import {
  buildStory,
  buildTimeline,
  fmtAgo,
  type LeadProfilePayload as Payload,
} from "@/lib/closeboss/leadProfile";

export function LeadProfileDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!leadId) return;
    let cancelled = false;
    fetch(`/api/dashboard/closeboss/lead/${leadId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData(j as Payload);
        else setError(j?.error ?? "Could not load this lead.");
      })
      .catch(() => !cancelled && setError("Could not load this lead."));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  // Merge every interaction into one relationship timeline.
  const timeline = useMemo(() => (data ? buildTimeline(data, 14) : []), [data]);

  // Keyboard contract for a modal panel: Escape closes it, focus moves into it
  // on open and returns to whatever opened it on close. Verified missing in
  // the 2026-09 UX audit — the drawer trapped keyboard users with no way out.
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!leadId) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [leadId, onClose]);

  if (!leadId) return null;
  const p = data?.person;
  const story = p ? buildStory(p) : "";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("pages.leadDrawer.leadProfile")}>
      <button type="button" aria-label={t("pages.leadDrawer.close")} onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <aside ref={panelRef} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl outline-none">
        {error && <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {!data && !error && <p className="m-6 text-center text-sm text-slate-400">{t("pages.leadProfile.gettingFullPicture")}</p>}
        {p && (
          <>
            {/* ── Who they are ── */}
            <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{p.name ?? t("pages.leadDrawer.unnamed")}</h2>
                  <p className="text-xs text-slate-500">
                    {[p.source, t("pages.leadDrawer.withYouSince", { date: new Date(p.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" }) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.rating && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.rating === "hot" ? "bg-red-100 text-red-700" : p.rating === "warm" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {p.rating}{typeof p.engagement_score === "number" ? ` · ${p.engagement_score}` : ""}
                    </span>
                  )}
                  <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("pages.leadDrawer.closePanel")}>
                    ✕
                  </button>
                </div>
              </div>
              {(p.intent || story) && (
                <p className="mt-2 text-sm text-slate-700">{p.intent ?? story}</p>
              )}
              {p.intent && story && <p className="mt-0.5 text-xs text-slate-500">{story}</p>}
              {p.auto_pilot && (
                <p className="mt-1.5 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{t("pages.leadDrawer.assistantHandling")}</p>
              )}
            </div>

            <div className="space-y-4 px-4 py-4">
              {/* ── Next best action ── */}
              {data?.nextBestAction && (
                <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a0e]">{t("pages.leadDrawer.nextBestAction")}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{data.nextBestAction.title}</p>
                  {data.nextBestAction.reason && <p className="text-xs text-slate-600">{data.nextBestAction.reason}</p>}
                  {data.nextBestAction.expected_outcome && (
                    <p className="mt-0.5 text-xs font-medium text-[#8a6a0e]">→ {data.nextBestAction.expected_outcome}</p>
                  )}
                </div>
              )}

              {/* ── How they found you (marketing hub journey) ── */}
              <HubJourney contactId={p.id} />

              {/* ── Notes (the relationship, in the Realtor's words) ── */}
              {p.notes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("pages.leadDrawer.whatYouKnow")}</p>
                  <p className="mt-1 text-sm leading-snug text-slate-700">{p.notes}</p>
                </div>
              )}

              {/* ── Open tasks for this person ── */}
              {data && data.tasks.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("pages.leadDrawer.openFollowUps")}</p>
                  <ul className="mt-1 space-y-1">
                    {data.tasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="min-w-0 truncate">☐ {t.title}</span>
                        {t.due_at && (
                          <span className={`shrink-0 text-xs ${new Date(t.due_at).getTime() < Date.now() ? "font-medium text-red-600" : "text-slate-400"}`}>
                            {new Date(t.due_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Relationship timeline ── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("pages.leadDrawer.storySoFar")}</p>
                {timeline.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">{t("pages.leadDrawer.noInteractions")}</p>
                ) : (
                  <ol className="mt-1.5 space-y-2">
                    {timeline.map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <span className="mt-0.5 text-sm" aria-hidden>{item.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800">{item.title}</p>
                          {item.detail && <p className="line-clamp-2 text-xs text-slate-500">{item.detail}</p>}
                          <p className="text-[10px] text-slate-400">{fmtAgo(item.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* ── Footer actions ── */}
            <div className="mt-auto flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <Link
                href={`/dashboard/leads/${encodeURIComponent(p.id)}`}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >{t("pages.leadDrawer.openFullProfile")}</Link>
              <Link href="/dashboard/inbox" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{t("pages.leadDrawer.conversations")}</Link>
              {p.phone && (
                <a href={`tel:${p.phone}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{t("pages.dashFragments.call")} {p.first_name ?? ""}
                </a>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

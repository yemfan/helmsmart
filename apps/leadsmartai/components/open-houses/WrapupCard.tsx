"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { OpenHouseRow, OpenHouseVisitorRow } from "@/lib/open-houses/types";
import { buildWrapupSummary, STATUS_LABEL, TIMELINE_LABEL, TIMELINE_ORDER, wrapupRecipients, type WrapupAudience } from "@/lib/open-houses/wrapup";

/**
 * The wrap-up card on the open-house page: the day's summary from the
 * sign-in sheet as it stands, who it goes to (the owner, the agent who
 * asked for the open house), the host's comment, and Send. The button
 * carries its own outcome; after sending, the card says when and to whom.
 */

const input = "mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100";

export function WrapupCard({ openHouse: initial, visitors, onUpdated }: { openHouse: OpenHouseRow; visitors: OpenHouseVisitorRow[]; onUpdated: (oh: OpenHouseRow) => void }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.openHouseDetail.wrapup.${s}`, vars);
  const [oh, setOH] = useState(initial);
  const [ownerName, setOwnerName] = useState(initial.owner_name ?? "");
  const [ownerEmail, setOwnerEmail] = useState(initial.owner_email ?? "");
  const [agentName, setAgentName] = useState(initial.requesting_agent_name ?? "");
  const [agentEmail, setAgentEmail] = useState(initial.requesting_agent_email ?? "");
  const [comment, setComment] = useState(initial.host_comment ?? "");
  const [toOwner, setToOwner] = useState(true);
  const [toAgent, setToAgent] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => buildWrapupSummary(visitors), [visitors]);
  const ended = Date.parse(oh.end_at) <= Date.now();
  const recipientsDraft = { owner_name: ownerName, owner_email: ownerEmail, requesting_agent_name: agentName, requesting_agent_email: agentEmail };
  const to: WrapupAudience[] = [...(toOwner ? (["owner"] as const) : []), ...(toAgent ? (["agent"] as const) : [])];
  const recipients = wrapupRecipients(recipientsDraft, to);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  async function saveRecipients(): Promise<OpenHouseRow | null> {
    const res = await fetch(`/api/dashboard/open-houses/${oh.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_name: ownerName.trim() || null, owner_email: ownerEmail.trim() || null, requesting_agent_name: agentName.trim() || null, requesting_agent_email: agentEmail.trim() || null, host_comment: comment.trim() || null }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; openHouse?: OpenHouseRow; error?: string };
    if (!res.ok || !body.ok || !body.openHouse) throw new Error(body.error ?? "save_failed");
    return body.openHouse;
  }

  async function send() {
    setError(null);
    setState("saving");
    try {
      const saved = await saveRecipients();
      if (saved) {
        setOH(saved);
        onUpdated(saved);
      }
      setState("sending");
      const res = await fetch(`/api/dashboard/open-houses/${oh.id}/wrapup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment: comment.trim() || null, to }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; openHouse?: OpenHouseRow; error?: string };
      if (!res.ok || !body.ok || !body.openHouse) {
        setError(body.error === "no_recipients" ? k("errNoRecipients") : k("errSend"));
        setState("error");
        return;
      }
      setOH(body.openHouse);
      onUpdated(body.openHouse);
      setState("sent");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error && e.message !== "save_failed" ? e.message : k("errSend"));
      setState("error");
    }
  }

  return (
    <section id="wrapup" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
        {oh.summary_sent_at ? <span className="text-xs text-emerald-700 dark:text-emerald-400">{k("sentOn", { date: when(oh.summary_sent_at), to: (oh.summary_sent_to ?? []).join(", ") })}</span> : ended ? <span className="text-xs text-amber-700 dark:text-amber-400">{k("ready")}</span> : <span className="text-xs text-slate-500">{k("notEnded")}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">{k("intro")}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: "visitors", value: summary.total },
          { key: "unrepresented", value: summary.unrepresented },
          { key: "hot", value: summary.hot },
          { key: "optedIn", value: summary.optedIn },
        ].map((x) => (
          <div key={x.key} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{k(`stat.${x.key}`)}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{x.value.toLocaleString(locale)}</dd>
          </div>
        ))}
      </dl>
      {summary.total > 0 ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {TIMELINE_ORDER.filter((x) => summary.byTimeline[x] > 0)
            .map((x) => `${TIMELINE_LABEL[x]}: ${summary.byTimeline[x]}`)
            .join(" · ")}
          {summary.byStatus.neighbor > 0 ? ` · ${STATUS_LABEL.neighbor}: ${summary.byStatus.neighbor}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <input type="checkbox" checked={toOwner} onChange={(e) => setToOwner(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            {k("toOwner")}
          </label>
          <input className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder={k("ownerName")} aria-label={k("ownerName")} />
          <input className={input} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder={k("ownerEmail")} aria-label={k("ownerEmail")} />
          <p className="mt-1 text-[11px] text-slate-500">{k("ownerHint")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <input type="checkbox" checked={toAgent} onChange={(e) => setToAgent(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            {k("toAgent")}
          </label>
          <input className={input} value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={k("agentName")} aria-label={k("agentName")} />
          <input className={input} type="email" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder={k("agentEmail")} aria-label={k("agentEmail")} />
          <p className="mt-1 text-[11px] text-slate-500">{k("agentHint")}</p>
        </div>
      </div>

      <label className="mt-3 block text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{k("comment")}</span>
        <textarea className={`${input} min-h-24`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder={k("commentPlaceholder")} />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={state === "saving" || state === "sending" || recipients.length === 0} className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {state === "saving" ? k("saving") : state === "sending" ? k("sending") : state === "sent" ? k("sent") : oh.summary_sent_at ? k("sendAgain") : k("send")}
        </button>
        <span className="text-xs text-slate-500">{recipients.length ? k("willGoTo", { list: recipients.map((r) => r.email).join(", ") }) : k("needRecipient")}</span>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-slate-500">{k("note")}</p>
    </section>
  );
}

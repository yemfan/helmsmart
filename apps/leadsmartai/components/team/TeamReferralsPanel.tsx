"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { createReferral, moveReferral, searchMyContacts } from "@/app/dashboard/team/actions";
import { intlLocale } from "@/lib/i18n/locale";
import type { MemberDirectory } from "@/lib/teams/directory.server";
import { FEE_MAX, feeOf, movesFor, NOTE_MAX, orderForAgent, summarizeReferrals, type Referral, type ReferralMove } from "@/lib/teams/referrals";
import type { TeamMembership } from "@/lib/teams/types";

/**
 * Referrals on /dashboard/team, for every member: hand a lead to a
 * colleague for a fee, answer the ones handed to you, and record the
 * closing so the fee is on record. Managers also see the office total.
 */

type Hit = { id: string; name: string; email: string | null; phone: string | null };

const STATUS_TONE: Record<Referral["status"], string> = {
  open: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  accepted: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  declined: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const smallBtn = "rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300";

function ReferForm({ teamId, currentAgentId, members, directory, onCreated }: { teamId: string; currentAgentId: string; members: TeamMembership[]; directory: MemberDirectory; onCreated: (r: Referral) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamReferrals.${s}`, vars);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [contact, setContact] = useState<Hit | null>(null);
  const [toAgentId, setToAgentId] = useState("");
  const [feePct, setFeePct] = useState("25");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (contact || q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("q", q);
      const r = await searchMyContacts(fd);
      setHits(r.ok ? r.hits : []);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, contact]);

  const colleagues = members.filter((m) => m.agentId !== currentAgentId);
  const who = (id: string) => directory[id]?.name ?? directory[id]?.email ?? id;

  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("contactId", contact?.id ?? "");
          fd.set("toAgentId", toAgentId);
          fd.set("feePct", feePct);
          fd.set("note", note);
          const r = await createReferral(fd);
          if (r.ok) {
            onCreated(r.referral);
            setContact(null);
            setQ("");
            setNote("");
            setSent(true);
            setTimeout(() => setSent(false), 2500);
          } else setError(r.field ? k(`error.${r.field}_${r.reason}`) : r.error);
        });
      }}
    >
      <label className="relative block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("contactLabel")}</span>
        {contact ? (
          <span className="flex items-center gap-2">
            <span className={`${input} flex-1`}>{contact.name}</span>
            <button type="button" className={smallBtn} onClick={() => setContact(null)}>
              {k("change")}
            </button>
          </span>
        ) : (
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={k("contactPlaceholder")} autoComplete="off" />
        )}
        {!contact && hits.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800" role="listbox">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setContact(h);
                    setHits([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-700"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{h.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{h.email ?? h.phone ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("toLabel")}</span>
        <select className={input} value={toAgentId} onChange={(e) => setToAgentId(e.target.value)} required>
          <option value="">{k("toPlaceholder")}</option>
          {colleagues.map((m) => (
            <option key={m.agentId} value={m.agentId}>
              {who(m.agentId)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("feeLabel")}</span>
        <input className={input} type="number" min={0} max={FEE_MAX} step={0.5} value={feePct} onChange={(e) => setFeePct(e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("noteLabel")}</span>
        <input className={input} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder={k("notePlaceholder")} />
      </label>
      <div className="md:col-span-2">
        <button type="submit" disabled={pending || !contact || !toAgentId} className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? k("sending") : sent ? k("sent") : k("send")}
        </button>
        {error ? (
          <p className="mt-2 text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function MoveButtons({ teamId, referral, agentId, onMoved }: { teamId: string; referral: Referral; agentId: string; onMoved: (r: Referral) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamReferrals.${s}`, vars);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const moves = movesFor(referral, agentId);
  if (moves.length === 0) return null;
  const go = (move: ReferralMove) =>
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("id", referral.id);
      fd.set("move", move);
      if (move === "close") fd.set("amount", amount);
      const r = await moveReferral(fd);
      if (r.ok) onMoved(r.referral);
      else setError(r.error);
    });
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {moves.includes("close") ? <input className={`${input} w-36`} type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={k("amountPlaceholder")} aria-label={k("amountPlaceholder")} /> : null}
      {moves.map((m) => (
        <button key={m} type="button" disabled={pending || (m === "close" && amount === "")} onClick={() => go(m)} className={m === "accept" || m === "close" ? "inline-flex min-h-8 items-center rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60" : smallBtn}>
          {pending ? k("moving") : k(`move.${m}`)}
        </button>
      ))}
      {error ? (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function TeamReferralsPanel({ teamId, currentAgentId, canManage, members, directory, initial }: { teamId: string; currentAgentId: string; canManage: boolean; members: TeamMembership[]; directory: MemberDirectory; initial: Referral[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamReferrals.${s}`, vars);
  const [rows, setRows] = useState<Referral[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const who = (id: string) => (id === currentAgentId ? t("pages.team.you") : (directory[id]?.name ?? directory[id]?.email ?? id));
  const money = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const date = (iso: string) => (mounted ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const mine = rows.filter((r) => r.fromAgentId === currentAgentId || r.toAgentId === currentAgentId);
  const ordered = orderForAgent(canManage ? rows : mine, currentAgentId);
  const summary = summarizeReferrals(canManage ? rows : mine);
  const replace = (r: Referral) => setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)));
  const td = "px-3 py-2 align-top text-sm text-slate-800 dark:text-slate-200";
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        {members.length > 1 ? (
          <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
            {showForm ? k("closeForm") : k("openForm")}
          </button>
        ) : null}
      </div>

      {showForm ? <ReferForm teamId={teamId} currentAgentId={currentAgentId} members={members} directory={directory} onCreated={(r) => setRows((prev) => [r, ...prev])} /> : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { key: "open", value: summary.open.toLocaleString(locale) },
          { key: "closed", value: summary.closed.toLocaleString(locale) },
          { key: "closedVolume", value: money(summary.closedVolume) },
          { key: "fees", value: money(summary.fees) },
        ].map(({ key, value }) => (
          <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k(`stat.${key}`)}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>

      {ordered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{members.length > 1 ? k("empty") : k("alone")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[56rem]">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className={th}>{k("col.contact")}</th>
                <th className={th}>{k("col.from")}</th>
                <th className={th}>{k("col.to")}</th>
                <th className={`${th} text-right`}>{k("col.fee")}</th>
                <th className={th}>{k("col.status")}</th>
                <th className={`${th} text-right hidden md:table-cell`}>{k("col.closed")}</th>
                <th className={`${th} hidden lg:table-cell`}>{k("col.date")}</th>
                <th className={th}>{k("col.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ordered.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} font-medium`}>
                    {r.contactName}
                    {r.note ? <span className="block text-xs font-normal text-slate-500">{r.note}</span> : null}
                  </td>
                  <td className={td}>{who(r.fromAgentId)}</td>
                  <td className={td}>{who(r.toAgentId)}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.feePct}%</td>
                  <td className={td}>
                    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[r.status]}`}>{k(`status.${r.status}`)}</span>
                  </td>
                  <td className={`${td} hidden md:table-cell text-right tabular-nums`}>
                    {r.closedAmount != null ? (
                      <>
                        {money(r.closedAmount)}
                        <span className="block text-xs text-slate-500">{k("feeLine", { fee: money(feeOf(r.closedAmount, r.feePct)) })}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${td} hidden lg:table-cell whitespace-nowrap text-slate-500`}>{date(r.createdAt)}</td>
                  <td className={td}>
                    <MoveButtons teamId={teamId} referral={r} agentId={currentAgentId} onMoved={replace} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{canManage ? k("noteManager") : k("note")}</p>
    </section>
  );
}

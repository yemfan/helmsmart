"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { importRoster, resendInvite } from "@/app/dashboard/team/actions";
import type { OnboardingBoard } from "@/lib/teams/onboarding.server";

/**
 * Brokerage onboarding on the team page: paste or upload a roster to queue
 * invitations, and a board that says where every agent is — invited, joined,
 * set up, hub live, accounts connected — so a broker can see who needs a
 * nudge without asking.
 */

type ImportResult =
  | { ok: true; invited: number; refreshed: number; alreadyMembers: number; seatsShort: number; seats: { used: number; cap: number | null }; rowsRead: number; capped: boolean; problems: { line: number; text: string; reason: string }[]; problemCount: number }
  | { ok: false; error: string; problems?: { line: number; text: string; reason: string }[] };

export function RosterImportCard({ teamId }: { teamId: string }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamOnboarding.${s}`, vars);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function readFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const content = await f.text();
    setText(content);
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("roster", text);
      const r = (await importRoster(fd)) as ImportResult;
      setResult(r);
      if (r.ok) setText("");
    });
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("importTitle")}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("importSub")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={k("importPlaceholder")}
        className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => void readFile(e.target.files)} />
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          {k("chooseFile")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? k("importing") : lines > 0 ? k("importCount", { count: lines }) : k("import")}
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">{k("importHint")}</span>
      </div>

      {result ? (
        result.ok ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p className="font-medium">{k("resultQueued", { count: result.invited })}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {result.refreshed > 0 ? <li>{k("resultRefreshed", { count: result.refreshed })}</li> : null}
              {result.alreadyMembers > 0 ? <li>{k("resultMembers", { count: result.alreadyMembers })}</li> : null}
              {result.seatsShort > 0 ? <li className="font-medium">{k("resultSeatsShort", { count: result.seatsShort, used: result.seats.used, cap: result.seats.cap ?? "∞" })}</li> : null}
              {result.problemCount > 0 ? <li>{k("resultProblems", { count: result.problemCount })}</li> : null}
              {result.capped ? <li>{k("resultCapped")}</li> : null}
            </ul>
            <p className="mt-2 text-xs">{k("resultMailer")}</p>
          </div>
        ) : (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">{result.error}</p>
        )
      ) : null}
      {result?.problems && result.problems.length > 0 ? (
        <details className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer">{k("problemsTitle", { count: result.problems.length })}</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {result.problems.map((p) => (
              <li key={p.line}>
                {p.line}: {p.text.slice(0, 80)} · {k(`reason.${p.reason}`)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function OnboardingBoardCard({ teamId, board }: { teamId: string; board: OnboardingBoard }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamOnboarding.${s}`, vars);
  const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
  const yes = <span className="text-emerald-700 dark:text-emerald-400">{k("yes")}</span>;
  const no = <span className="text-slate-400">{k("no")}</span>;

  const stats: [string, number][] = [
    [k("statMembers"), board.totals.members],
    [k("statOnboarded"), board.totals.onboarded],
    [k("statHubs"), board.totals.hubsLive],
    [k("statConnected"), board.totals.connected],
    [k("statPending"), board.totals.pending],
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("boardTitle")}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("boardSub")}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value.toLocaleString(locale)}</dd>
          </div>
        ))}
      </dl>

      {board.members.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[44rem]">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className={th}>{k("colAgent")}</th>
                <th className={th}>{k("colJoined")}</th>
                <th className={th}>{k("colSetUp")}</th>
                <th className={th}>{k("colHub")}</th>
                <th className={th}>{k("colAccounts")}</th>
                <th className={th}>{k("colContacts")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {board.members.map((m) => (
                <tr key={m.agentId}>
                  <td className={td}>
                    <span className="font-medium">{m.name ?? m.email ?? m.agentId}</span>
                    {m.name && m.email ? <span className="block text-xs text-slate-500 dark:text-slate-400">{m.email}</span> : null}
                    {m.role === "owner" ? <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">{t("pages.team.owner")}</span> : null}
                  </td>
                  <td className={td}>{date(m.joinedAt)}</td>
                  <td className={td}>{m.onboardingCompleted ? yes : no}</td>
                  <td className={td}>
                    {m.hubPublished && m.username ? (
                      <a href={`/@${m.username}`} target="_blank" rel="noopener noreferrer" className="text-[#0072ce] hover:underline">
                        @{m.username}
                      </a>
                    ) : (
                      no
                    )}
                  </td>
                  <td className={`${td} tabular-nums`}>{m.connections}</td>
                  <td className={`${td} tabular-nums`}>{m.contacts.toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {board.invites.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {k("invitesTitle", { count: board.invites.length })}
            {board.totals.queued > 0 ? ` · ${k("invitesQueued", { count: board.totals.queued })}` : ""}
            {board.totals.failed > 0 ? ` · ${k("invitesFailed", { count: board.totals.failed })}` : ""}
          </h3>
          <ul className="mt-2 max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {board.invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                    {inv.name ? <span className="font-medium">{inv.name} · </span> : null}
                    {inv.email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {inv.expired
                      ? k("statusExpired")
                      : inv.emailSentAt
                        ? k("statusSent", { date: date(inv.emailSentAt) })
                        : inv.emailError
                          ? k("statusFailed")
                          : k("statusQueued")}
                  </p>
                </div>
                <ResendButton teamId={teamId} inviteId={inv.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ResendButton({ teamId, inviteId }: { teamId: string; inviteId: string }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("inviteId", inviteId);
          const r = await resendInvite(fd);
          if (r.ok) setDone(true);
        })
      }
      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
    >
      {done ? t("pages.teamOnboarding.resent") : pending ? t("pages.teamOnboarding.resending") : t("pages.teamOnboarding.resend")}
    </button>
  );
}

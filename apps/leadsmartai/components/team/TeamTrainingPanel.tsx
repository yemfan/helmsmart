"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { addTraining, removeTraining, setTrainingDone } from "@/app/dashboard/team/actions";
import { intlLocale } from "@/lib/i18n/locale";
import {
  compareMemberStates,
  dateIn,
  DESCRIPTION_MAX,
  isUrl,
  LOCATION_MAX,
  sortTrainings,
  statusFor,
  summarizeMember,
  TITLE_MAX,
  trackedMembers,
  type CellStatus,
  type Completion,
  type MemberState,
  type Training,
} from "@/lib/teams/training";
import type { TeamMembership } from "@/lib/teams/types";
import type { MemberDirectory } from "@/lib/teams/directory.server";

/**
 * Brokerage training on /dashboard/team.
 *
 * Everyone sees the office's classes, mandatory first, and marks the ones
 * they finished. Managers post and remove classes, record attendance for
 * anyone, and get a grid of where every agent stands. Dates are judged in the
 * viewer's account timezone (`today` comes from the server in that zone), so
 * the status on screen does not depend on the browser's clock.
 */

type Props = {
  teamId: string;
  currentAgentId: string;
  canManage: boolean;
  members: TeamMembership[];
  directory: MemberDirectory;
  initialTrainings: Training[];
  initialCompletions: Completion[];
  /** YYYY-MM-DD in `timeZone`. */
  today: string;
  timeZone: string;
};

const ckey = (trainingId: string, agentId: string) => `${trainingId}:${agentId}`;

const STATE_TONE: Record<MemberState, string> = {
  current: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  behind: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  in_progress: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  none: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

const CELL_GLYPH: Record<CellStatus, { glyph: string; tone: string }> = {
  done: { glyph: "✓", tone: "text-emerald-600 dark:text-emerald-400" },
  overdue: { glyph: "!", tone: "font-bold text-rose-600 dark:text-rose-400" },
  due: { glyph: "–", tone: "text-slate-400" },
  open: { glyph: "–", tone: "text-slate-300 dark:text-slate-600" },
};

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const smallButton =
  "rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300";

function AddForm({ teamId, onAdded }: { teamId: string; onAdded: (t: Training) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamTraining.${s}`, vars);
  const [required, setRequired] = useState(true);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [materialsUrl, setMaterialsUrl] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("title", title);
          fd.set("required", required ? "1" : "0");
          // datetime-local has no zone: read it in the browser's own, send an instant.
          if (when) {
            const d = new Date(when);
            fd.set("startsAt", Number.isNaN(d.getTime()) ? when : d.toISOString());
          }
          fd.set("location", location);
          fd.set("materialsUrl", materialsUrl);
          fd.set("dueOn", required ? dueOn : "");
          fd.set("description", description);
          const r = await addTraining(fd);
          if (r.ok) {
            onAdded(r.training);
            setTitle("");
            setWhen("");
            setLocation("");
            setMaterialsUrl("");
            setDueOn("");
            setDescription("");
            setAdded(true);
            setTimeout(() => setAdded(false), 2500);
          } else setError(r.field ? k(`error.${r.field}_${r.reason}`) : k("error.failed"));
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={k("typeLabel")}>
        {[true, false].map((isRequired) => (
          <button
            key={String(isRequired)}
            type="button"
            role="radio"
            aria-checked={required === isRequired}
            onClick={() => setRequired(isRequired)}
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${required === isRequired ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {isRequired ? k("mandatory") : k("optional")}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("titleLabel")}</span>
        <input className={input} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={k("titlePlaceholder")} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("whenLabel")}</span>
          <input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{k("whenHint")}</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("locationLabel")}</span>
          <input className={input} value={location} maxLength={LOCATION_MAX} onChange={(e) => setLocation(e.target.value)} placeholder={k("locationPlaceholder")} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("materialsLabel")}</span>
          <input className={input} type="url" value={materialsUrl} onChange={(e) => setMaterialsUrl(e.target.value)} placeholder="https://…" />
        </label>
        {required ? (
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("dueLabel")}</span>
            <input className={`${input} sm:w-44`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{k("dueHint")}</span>
          </label>
        ) : null}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("descriptionLabel")}</span>
        <textarea className={`${input} min-h-20`} value={description} maxLength={DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} placeholder={k("descriptionPlaceholder")} />
      </label>
      <div>
        <button type="submit" disabled={pending} className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? k("adding") : added ? k("added") : k("add")}
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

export function TeamTrainingPanel({ teamId, currentAgentId, canManage, members, directory, initialTrainings, initialCompletions, today, timeZone }: Props) {
  const { t, i18n } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamTraining.${s}`, vars);
  const locale = intlLocale(i18n.language);
  const [trainings, setTrainings] = useState<Training[]>(initialTrainings);
  const [completions, setCompletions] = useState<Map<string, Completion>>(() => new Map(initialCompletions.map((c) => [ckey(c.trainingId, c.agentId), c])));
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sorted = useMemo(() => sortTrainings(trainings), [trainings]);
  const mandatory = sorted.filter((x) => x.required);
  const optional = sorted.filter((x) => !x.required);
  const tracked = useMemo(() => trackedMembers(members), [members]);
  const joinedOn = (m: TeamMembership | undefined) => (m?.createdAt ? dateIn(m.createdAt, timeZone) : null);
  const me = members.find((m) => m.agentId === currentAgentId);
  const who = (id: string | null) => (id ? (directory[id]?.name ?? directory[id]?.email ?? null) : null);

  const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
  const fmtDone = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: "medium", timeZone });

  const doneIdsFor = (agentId: string) => new Set(trainings.filter((x) => completions.has(ckey(x.id, agentId))).map((x) => x.id));

  function toggle(trainingId: string, agentId: string, done: boolean) {
    const key = ckey(trainingId, agentId);
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("trainingId", trainingId);
      fd.set("agentId", agentId);
      fd.set("done", done ? "1" : "0");
      const r = await setTrainingDone(fd);
      setBusy(null);
      if (!r.ok) {
        setError(k(`error.${r.code}`));
        return;
      }
      setCompletions((prev) => {
        const next = new Map(prev);
        if (r.completion) next.set(key, r.completion);
        else next.delete(key);
        return next;
      });
    });
  }

  function remove(id: string) {
    if (!window.confirm(k("removeConfirm"))) return;
    setBusy(`remove:${id}`);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("id", id);
      const r = await removeTraining(fd);
      setBusy(null);
      if (r.ok) setTrainings((prev) => prev.filter((x) => x.id !== id));
      else setError(k("error.remove_failed"));
    });
  }

  const mySummary =
    me && me.role !== "owner" && mandatory.length > 0
      ? summarizeMember({ trainings, doneIds: doneIdsFor(currentAgentId), joinedOn: joinedOn(me), today, timeZone })
      : null;

  const rows = canManage
    ? tracked
        .map((m) => ({ m, name: who(m.agentId) ?? k("unnamed"), summary: summarizeMember({ trainings, doneIds: doneIdsFor(m.agentId), joinedOn: joinedOn(m), today, timeZone }) }))
        .sort((a, b) => compareMemberStates(a.summary.state, b.summary.state) || a.name.localeCompare(b.name, locale))
    : [];

  const renderItem = (item: Training) => {
    const mine = completions.get(ckey(item.id, currentAgentId));
    const status = statusFor({ training: item, done: !!mine, joinedOn: joinedOn(me), today, timeZone });
    const canUndo = !!mine && (mine.recordedBy === null || mine.recordedBy === currentAgentId || canManage);
    const doneCount = tracked.filter((m) => completions.has(ckey(item.id, m.agentId))).length;
    const locationIsLink = isUrl(item.location);
    const meta: ReactNode[] = [];
    meta.push(<span key="when">{item.startsAt ? fmtWhen(item.startsAt) : k("selfPaced")}</span>);
    if (item.location && !locationIsLink) meta.push(<span key="where">{item.location}</span>);
    if (item.dueOn) meta.push(<span key="due">{k("due", { date: fmtDay(item.dueOn) })}</span>);
    return (
      <li key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h4>
            <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
              {meta.map((node, i) => (
                <span key={i} className="inline-flex gap-x-1.5">
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {node}
                </span>
              ))}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status === "done" && mine ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                {k("doneOn", { date: fmtDone(mine.completedAt) })}
                {mine.recordedBy && mine.recordedBy !== currentAgentId && who(mine.recordedBy) ? (
                  <span className="text-slate-500 dark:text-slate-400"> · {k("confirmedBy", { name: who(mine.recordedBy) })}</span>
                ) : null}
              </span>
            ) : status === "overdue" ? (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{k("status.overdue")}</span>
            ) : null}
            {mine ? (
              canUndo ? (
                <button type="button" className={smallButton} disabled={busy === ckey(item.id, currentAgentId)} onClick={() => toggle(item.id, currentAgentId, false)}>
                  {busy === ckey(item.id, currentAgentId) ? k("saving") : k("undo")}
                </button>
              ) : null
            ) : (
              <button type="button" className={smallButton} disabled={busy === ckey(item.id, currentAgentId)} onClick={() => toggle(item.id, currentAgentId, true)}>
                {busy === ckey(item.id, currentAgentId) ? k("saving") : k("markDone")}
              </button>
            )}
          </div>
        </div>
        {item.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {locationIsLink && item.location ? (
            <a href={item.location} target="_blank" rel="noreferrer" className={smallButton}>
              {k("joinLink")}
            </a>
          ) : null}
          {/* The class itself: a self-paced course, a deck, whatever the office linked.
              It is the one thing an agent comes here to do, so it reads as the action. */}
          {item.materialsUrl ? (
            <a
              href={item.materialsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
            >
              {mine ? k("startAgain") : k("start")}
            </a>
          ) : null}
          {canManage ? (
            <>
              <span className="ml-auto text-xs tabular-nums text-slate-500 dark:text-slate-400">{k("doneCount", { done: doneCount, total: tracked.length })}</span>
              <button
                type="button"
                disabled={busy === `remove:${item.id}`}
                onClick={() => remove(item.id)}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:border-slate-600"
              >
                {busy === `remove:${item.id}` ? k("removing") : k("remove")}
              </button>
            </>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {k("title")}
            <span className="ml-2 text-sm font-normal text-slate-400">· {trainings.length}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{canManage ? k("subtitleManager") : k("subtitle")}</p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
            {showForm ? k("closeForm") : k("openForm")}
          </button>
        ) : null}
      </div>

      {mySummary ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {mySummary.state === "current" ? k("mineAll") : k("mine", { done: mySummary.requiredDone, total: mySummary.requiredTotal })}
          {mySummary.overdue > 0 ? <span className="ml-1 font-medium text-rose-600 dark:text-rose-400">{k("mineOverdue", { count: mySummary.overdue })}</span> : null}
        </p>
      ) : null}

      {canManage && showForm ? <AddForm teamId={teamId} onAdded={(x) => setTrainings((prev) => [x, ...prev])} /> : null}

      {trainings.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{canManage ? k("emptyManager") : k("empty")}</p>
      ) : (
        <div className="mt-4 space-y-5">
          {mandatory.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k("mandatoryCount", { count: mandatory.length })}</h3>
              <ul className="mt-2 grid gap-3">
                {mandatory.map((x) => renderItem(x))}
              </ul>
            </div>
          ) : null}
          {optional.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k("optionalCount", { count: optional.length })}</h3>
              <ul className="mt-2 grid gap-3">
                {optional.map((x) => renderItem(x))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {canManage && trainings.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("statusTitle")}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{k("statusSub")}</p>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{k("noMembers")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium dark:bg-slate-800">
                      {k("agentCol")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {k("statusCol")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {k("mandatoryCol")}
                    </th>
                    {sorted.map((x) => (
                      <th key={x.id} scope="col" className="w-28 min-w-28 px-2 py-2 text-center align-bottom font-medium" title={x.title}>
                        <span className="line-clamp-2 text-slate-600 dark:text-slate-300">{x.title}</span>
                        <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wider text-slate-400">{x.required ? k("mandatory") : k("optional")}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map(({ m, name, summary }) => (
                    <tr key={m.agentId}>
                      <th scope="row" className="sticky left-0 z-10 max-w-48 truncate bg-white px-3 py-2 text-left font-medium text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                        {name}
                      </th>
                      <td className="px-3 py-2">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATE_TONE[summary.state]}`}>{k(`state.${summary.state}`)}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {summary.requiredTotal > 0 ? `${summary.requiredDone}/${summary.requiredTotal}` : "–"}
                      </td>
                      {sorted.map((x) => {
                        const key = ckey(x.id, m.agentId);
                        const done = completions.has(key);
                        const s = statusFor({ training: x, done, joinedOn: joinedOn(m), today, timeZone });
                        const g = CELL_GLYPH[s];
                        return (
                          <td key={x.id} className="px-2 py-1 text-center">
                            <button
                              type="button"
                              disabled={busy === key}
                              onClick={() => toggle(x.id, m.agentId, !done)}
                              aria-label={k("cellLabel", { name, title: x.title, status: k(`status.${s}`) })}
                              title={k(`status.${s}`)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800 ${g.tone}`}
                            >
                              {busy === key ? "…" : g.glyph}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{k("legend")}</p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

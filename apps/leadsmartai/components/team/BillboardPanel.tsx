"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { markAnnouncementsRead, pinAnnouncement, postAnnouncement, reactToAnnouncement, removeAnnouncement } from "@/app/dashboard/team/actions";
import { intlLocale } from "@/lib/i18n/locale";
import { ANNOUNCEMENT_KINDS, BODY_MAX, REACTION_GLYPH, REACTIONS, reachPercent, TITLE_MAX, type Announcement, type AnnouncementKind, type Reaction } from "@/lib/teams/billboard";
import type { MemberDirectory } from "@/lib/teams/directory.server";
import type { TeamMembership } from "@/lib/teams/types";

/**
 * The brokerage billboard on /dashboard/team. Every member reads it and
 * reacts; opening the page marks what is on it read. Managers post, pin
 * and remove, and see the reach of each post ("Seen by 812 of 1,200").
 */

const KIND_TONE: Record<AnnouncementKind, string> = {
  news: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
  win: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  event: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
  reminder: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  policy: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  welcome: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
};

const KIND_GLYPH: Record<AnnouncementKind, string> = { news: "📣", win: "🏆", event: "📅", reminder: "⏰", policy: "📌", welcome: "👋" };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
const smallBtn = "rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300";

export function KindBadge({ kind }: { kind: AnnouncementKind }) {
  const { t } = useTranslation("dashboard");
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${KIND_TONE[kind]}`}>
      <span aria-hidden>{KIND_GLYPH[kind]}</span>
      {t(`pages.teamBillboard.kind.${kind}`)}
    </span>
  );
}

function Composer({ teamId, members, directory, currentAgentId, onPosted }: { teamId: string; members: TeamMembership[]; directory: MemberDirectory; currentAgentId: string; onPosted: (a: Announcement) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBillboard.${s}`, vars);
  const [kind, setKind] = useState<AnnouncementKind>("news");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [shoutout, setShoutout] = useState("");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [email, setEmail] = useState(false);
  const [pending, startTransition] = useTransition();
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = (id: string) => directory[id]?.name ?? directory[id]?.email ?? id;

  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("kind", kind);
          fd.set("title", title);
          fd.set("body", body);
          fd.set("linkUrl", linkUrl);
          fd.set("shoutoutAgentId", shoutout);
          fd.set("pinned", String(pinned));
          fd.set("expiresAt", expiresAt);
          fd.set("email", String(email));
          const r = await postAnnouncement(fd);
          if (r.ok) {
            onPosted(r.announcement);
            setTitle("");
            setBody("");
            setLinkUrl("");
            setShoutout("");
            setPinned(false);
            setExpiresAt("");
            setEmail(false);
            setPosted(true);
            setTimeout(() => setPosted(false), 2500);
          } else setError(r.field ? k(`error.${r.field}_${r.reason}`) : r.error);
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={k("kindLabel")}>
        {ANNOUNCEMENT_KINDS.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={kind === x} onClick={() => setKind(x)} className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition ${kind === x ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            <span aria-hidden>{KIND_GLYPH[x]}</span>
            {k(`kind.${x}`)}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{k("titleLabel")}</span>
        <input className={input} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={k(`titlePlaceholder.${kind}`)} required />
      </label>
      {kind === "win" ? (
        <label className="block text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("shoutoutLabel")}</span>
          <select className={input} value={shoutout} onChange={(e) => setShoutout(e.target.value)}>
            <option value="">{k("shoutoutNone")}</option>
            {members.map((m) => (
              <option key={m.agentId} value={m.agentId}>
                {m.agentId === currentAgentId ? t("pages.team.you") : who(m.agentId)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{k("bodyLabel")}</span>
        <textarea className={`${input} min-h-24`} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder={k("bodyPlaceholder")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("linkLabel")}</span>
          <input className={input} type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("expiresLabel")}</span>
          <input className={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          <span className="text-slate-800 dark:text-slate-200">{k("pinLabel")}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          <span className="text-slate-800 dark:text-slate-200">{k("emailLabel", { count: members.length })}</span>
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending} className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? k("posting") : posted ? k("posted") : k("post")}
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

function ReactionBar({ a, onReact }: { a: Announcement; onReact: (r: Reaction | null) => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <span className="flex items-center gap-1">
      {REACTIONS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={a.mine.reaction === r}
          aria-label={t(`pages.teamBillboard.reaction.${r}`)}
          onClick={() => onReact(a.mine.reaction === r ? null : r)}
          className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-xs ring-1 transition ${a.mine.reaction === r ? "bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-950/40 dark:text-blue-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"}`}
        >
          <span aria-hidden>{REACTION_GLYPH[r]}</span>
          {a.reactions[r] > 0 ? <span className="tabular-nums">{a.reactions[r]}</span> : null}
        </button>
      ))}
    </span>
  );
}

export function BillboardPanel({ teamId, currentAgentId, canManage, members, directory, initial }: { teamId: string; currentAgentId: string; canManage: boolean; members: TeamMembership[]; directory: MemberDirectory; initial: Announcement[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBillboard.${s}`, vars);
  const [items, setItems] = useState<Announcement[]>(initial);
  const [showComposer, setShowComposer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const marked = useRef(false);
  useEffect(() => setMounted(true), []);

  // Opening the board is reading it: record the reads once, quietly.
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    const unread = initial.filter((a) => !a.mine.read).map((a) => a.id);
    if (!unread.length) return;
    const fd = new FormData();
    fd.set("ids", unread.join(","));
    void markAnnouncementsRead(fd).then((r) => {
      if (r.ok) setItems((prev) => prev.map((a) => (unread.includes(a.id) ? { ...a, readCount: a.readCount + 1, mine: { ...a.mine, read: true } } : a)));
    });
  }, [initial]);

  const who = (id: string | null) => (id ? (id === currentAgentId ? t("pages.team.you") : (directory[id]?.name ?? directory[id]?.email ?? null)) : null);
  const date = (iso: string) => (mounted ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const replace = (a: Announcement) => setItems((prev) => prev.map((x) => (x.id === a.id ? a : x)));

  const onReact = (a: Announcement, r: Reaction | null) => {
    const prev = a.mine.reaction;
    const next: Announcement = { ...a, reactions: { ...a.reactions }, mine: { read: true, reaction: r } };
    if (prev) next.reactions[prev] = Math.max(0, next.reactions[prev] - 1);
    if (r) next.reactions[r] += 1;
    if (!a.mine.read) next.readCount += 1;
    replace(next);
    const fd = new FormData();
    fd.set("id", a.id);
    fd.set("reaction", r ?? "");
    void reactToAnnouncement(fd).then((res) => {
      if (!res.ok) replace(a);
    });
  };

  return (
    <section id="billboard" className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{canManage ? k("subtitleManager") : k("subtitle")}</p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setShowComposer((v) => !v)} aria-expanded={showComposer} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
            {showComposer ? k("closeComposer") : k("openComposer")}
          </button>
        ) : null}
      </div>

      {canManage && showComposer ? <Composer teamId={teamId} members={members} directory={directory} currentAgentId={currentAgentId} onPosted={(a) => setItems((prev) => [a, ...prev].sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.createdAt.localeCompare(x.createdAt)))} /> : null}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{canManage ? k("emptyManager") : k("empty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((a) => (
            <li key={a.id} className={`rounded-lg border p-4 ${a.pinned ? "border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-700"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={a.kind} />
                    {a.pinned ? <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{k("pinned")}</span> : null}
                    {!a.mine.read ? <span className="h-2 w-2 rounded-full bg-blue-600" aria-label={k("unread")} /> : null}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {a.title}
                    {a.kind === "win" && a.shoutoutAgentId && who(a.shoutoutAgentId) ? <span className="ml-2 font-normal text-amber-800 dark:text-amber-300">— {who(a.shoutoutAgentId)}</span> : null}
                  </h3>
                </div>
                {canManage ? (
                  <span className="flex items-center gap-1.5">
                    <PinButton teamId={teamId} a={a} onDone={replace} />
                    <RemoveButton teamId={teamId} id={a.id} onRemoved={() => setItems((prev) => prev.filter((x) => x.id !== a.id))} />
                  </span>
                ) : null}
              </div>
              {a.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{a.body}</p> : null}
              {a.linkUrl ? (
                <a href={a.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                  {k("openLink")}
                </a>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <ReactionBar a={a} onReact={(r) => onReact(a, r)} />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {who(a.authorAgentId) ? k("byOn", { name: who(a.authorAgentId), date: date(a.createdAt) }) : date(a.createdAt)}
                  {canManage ? ` · ${k("seenBy", { count: a.readCount, total: members.length, pct: reachPercent(a.readCount, members.length) })}` : ""}
                  {a.emailRequestedAt ? ` · ${k("emailed")}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PinButton({ teamId, a, onDone }: { teamId: string; a: Announcement; onDone: (a: Announcement) => void }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("id", a.id);
          fd.set("pinned", String(!a.pinned));
          const r = await pinAnnouncement(fd);
          if (r.ok) onDone({ ...a, pinned: !a.pinned });
        })
      }
      className={smallBtn}
    >
      {a.pinned ? t("pages.teamBillboard.unpin") : t("pages.teamBillboard.pin")}
    </button>
  );
}

function RemoveButton({ teamId, id, onRemoved }: { teamId: string; id: string; onRemoved: () => void }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("id", id);
          const r = await removeAnnouncement(fd);
          if (r.ok) onRemoved();
        })
      }
      className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:border-slate-600"
    >
      {pending ? t("pages.teamBillboard.removing") : t("pages.teamBillboard.remove")}
    </button>
  );
}

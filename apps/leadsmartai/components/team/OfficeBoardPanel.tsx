"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { likeBoardPost, postToBoard, removeBoardPost, removeBoardReply, replyToBoard } from "@/app/dashboard/team/actions";
import { intlLocale } from "@/lib/i18n/locale";
import { BOARD_KINDS, BODY_MAX, possibleMatches, REPLY_MAX, TITLE_MAX, type BoardKind, type BoardPost, type BoardReply } from "@/lib/teams/board";
import type { MemberDirectory } from "@/lib/teams/directory.server";

/**
 * The office board on /dashboard/team: the unofficial one. Any member
 * posts a listing, a buyer need, a question, a tip or anything; colleagues
 * reply and like. A listing and a buyer need that could be a deal point at
 * each other. Authors take down their own posts; managers can take down any.
 */

const KIND_TONE: Record<BoardKind, string> = {
  listing: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  buyer_need: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
  question: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  tip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
  other: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};
const KIND_GLYPH: Record<BoardKind, string> = { listing: "🏠", buyer_need: "🔎", question: "❓", tip: "💡", other: "💬" };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
const smallBtn = "rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300";

function Composer({ teamId, onPosted }: { teamId: string; onPosted: (p: BoardPost) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBoard.${s}`, vars);
  const [kind, setKind] = useState<BoardKind>("listing");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = kind === "listing" || kind === "buyer_need";
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
          fd.set("price", price);
          const r = await postToBoard(fd);
          if (r.ok) {
            onPosted(r.post);
            setTitle("");
            setBody("");
            setLinkUrl("");
            setPrice("");
            setPosted(true);
            setTimeout(() => setPosted(false), 2500);
          } else setError(r.field ? k(`error.${r.field}_${r.reason}`) : r.error);
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={k("kindLabel")}>
        {BOARD_KINDS.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={kind === x} onClick={() => setKind(x)} className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition ${kind === x ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            <span aria-hidden>{KIND_GLYPH[x]}</span>
            {k(`kind.${x}`)}
          </button>
        ))}
      </div>
      <div className={`grid gap-3 ${money ? "sm:grid-cols-[1fr_11rem]" : ""}`}>
        <label className="block text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("titleLabel")}</span>
          <input className={input} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={k(`titlePlaceholder.${kind}`)} required />
        </label>
        {money ? (
          <label className="block text-sm">
            <span className="font-medium text-slate-800 dark:text-slate-200">{kind === "listing" ? k("priceLabel") : k("budgetLabel")}</span>
            <input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
          </label>
        ) : null}
      </div>
      <label className="block text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{k("bodyLabel")}</span>
        <textarea className={`${input} min-h-20`} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder={k("bodyPlaceholder")} />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{k("linkLabel")}</span>
        <input className={input} type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
      </label>
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

function ReplyForm({ teamId, postId, onReplied }: { teamId: string; postId: string; onReplied: (r: BoardReply) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBoard.${s}`, vars);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-2 flex items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const fd = new FormData();
          fd.set("teamId", teamId);
          fd.set("postId", postId);
          fd.set("body", body);
          const r = await replyToBoard(fd);
          if (r.ok) {
            onReplied(r.reply);
            setBody("");
          } else setError(r.error);
        });
      }}
    >
      <input className={`${input} mt-0 flex-1`} value={body} maxLength={REPLY_MAX} onChange={(e) => setBody(e.target.value)} placeholder={k("replyPlaceholder")} aria-label={k("replyPlaceholder")} />
      <button type="submit" disabled={pending || !body.trim()} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
        {pending ? k("replying") : k("reply")}
      </button>
      {error ? (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export function OfficeBoardPanel({ teamId, currentAgentId, canManage, directory, initial }: { teamId: string; currentAgentId: string; canManage: boolean; directory: MemberDirectory; initial: BoardPost[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBoard.${s}`, vars);
  const [posts, setPosts] = useState<BoardPost[]>(initial);
  const [filter, setFilter] = useState<BoardKind | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const who = (id: string) => (id === currentAgentId ? t("pages.team.you") : (directory[id]?.name ?? directory[id]?.email ?? id));
  const date = (iso: string) => (mounted ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const money = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const replace = (p: BoardPost) => setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const shown = filter ? posts.filter((p) => p.kind === filter) : posts;

  const toggleLike = (p: BoardPost) => {
    const next = { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) };
    replace(next);
    const fd = new FormData();
    fd.set("postId", p.id);
    fd.set("liked", String(next.likedByMe));
    void likeBoardPost(fd).then((r) => {
      if (!r.ok) replace(p);
    });
  };

  return (
    <section id="board" className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {k("title")}
            <span className="ml-2 text-sm font-normal text-slate-400">· {posts.length}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        <button type="button" onClick={() => setShowComposer((v) => !v)} aria-expanded={showComposer} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
          {showComposer ? k("closeComposer") : k("openComposer")}
        </button>
      </div>

      {showComposer ? <Composer teamId={teamId} onPosted={(p) => setPosts((prev) => [p, ...prev])} /> : null}

      {posts.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label={k("kindLabel")}>
          <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium ${filter === null ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            {k("all")}
          </button>
          {BOARD_KINDS.filter((x) => posts.some((p) => p.kind === x)).map((x) => (
            <button key={x} type="button" aria-pressed={filter === x} onClick={() => setFilter(filter === x ? null : x)} className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-medium ${filter === x ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              <span aria-hidden>{KIND_GLYPH[x]}</span>
              {k(`kind.${x}`)}
            </button>
          ))}
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{k("empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shown.map((p) => {
            const matches = possibleMatches(p, posts);
            const isOpen = open.has(p.id);
            const mine = p.authorAgentId === currentAgentId;
            return (
              <li key={p.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${KIND_TONE[p.kind]}`}>
                        <span aria-hidden>{KIND_GLYPH[p.kind]}</span>
                        {k(`kind.${p.kind}`)}
                      </span>
                      {p.price != null ? <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{p.kind === "buyer_need" ? k("upTo", { price: money(p.price) }) : money(p.price)}</span> : null}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{p.title}</h3>
                  </div>
                  {mine || canManage ? (
                    <RemoveButton
                      label={k("remove")}
                      pendingLabel={k("removing")}
                      onRemove={async () => {
                        const fd = new FormData();
                        fd.set("teamId", teamId);
                        fd.set("id", p.id);
                        const r = await removeBoardPost(fd);
                        if (r.ok) setPosts((prev) => prev.filter((x) => x.id !== p.id));
                      }}
                    />
                  ) : null}
                </div>
                {p.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{p.body}</p> : null}
                {p.linkUrl ? (
                  <a href={p.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                    {k("openLink")}
                  </a>
                ) : null}
                {matches.length > 0 ? (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                    {k(p.kind === "listing" ? "matchBuyers" : "matchListings", { count: matches.length })} {matches.map((m) => `${who(m.authorAgentId)}: ${m.title}`).join(" · ")}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <button type="button" aria-pressed={p.likedByMe} onClick={() => toggleLike(p)} className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-xs ring-1 transition ${p.likedByMe ? "bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-950/40 dark:text-blue-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"}`}>
                      <span aria-hidden>👍</span>
                      {p.likes > 0 ? <span className="tabular-nums">{p.likes}</span> : null}
                    </button>
                    <button type="button" onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className={smallBtn} aria-expanded={isOpen}>
                      {k("replies", { count: p.replies.length })}
                    </button>
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{k("byOn", { name: who(p.authorAgentId), date: date(p.createdAt) })}</span>
                </div>
                {isOpen ? (
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                    {p.replies.length > 0 ? (
                      <ul className="space-y-2">
                        {p.replies.map((r) => (
                          <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                            <span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">{who(r.authorAgentId)}</span>
                              <span className="ml-2 text-xs text-slate-400">{date(r.createdAt)}</span>
                              <span className="block whitespace-pre-wrap text-slate-700 dark:text-slate-300">{r.body}</span>
                            </span>
                            {r.authorAgentId === currentAgentId || canManage ? (
                              <RemoveButton
                                label={k("remove")}
                                pendingLabel={k("removing")}
                                onRemove={async () => {
                                  const fd = new FormData();
                                  fd.set("teamId", teamId);
                                  fd.set("replyId", r.id);
                                  const res = await removeBoardReply(fd);
                                  if (res.ok) replace({ ...p, replies: p.replies.filter((x) => x.id !== r.id) });
                                }}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ReplyForm teamId={teamId} postId={p.id} onReplied={(r) => replace({ ...p, replies: [...p.replies, r] })} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
    </section>
  );
}

function RemoveButton({ label, pendingLabel, onRemove }: { label: string; pendingLabel: string; onRemove: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(onRemove)} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:border-slate-600">
      {pending ? pendingLabel : label}
    </button>
  );
}

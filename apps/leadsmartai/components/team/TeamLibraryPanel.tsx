"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { addLibraryItem, removeLibraryItem } from "@/app/dashboard/team/actions";
import { BODY_MAX, composerHref, LIBRARY_KINDS, mediaShape, TITLE_MAX, type LibraryItem, type LibraryKind } from "@/lib/teams/library";
import type { MemberDirectory } from "@/lib/teams/directory.server";

/**
 * The brokerage content library on /dashboard/team. Every member sees it
 * and posts from it — copy the wording, or open the composer with it as
 * the brief; open a shared image, video or link. Managers add and remove.
 * Each agent still posts from their own account on their own plan: the
 * library shares words and files, never billing.
 */

const KIND_TONE: Record<LibraryKind, string> = {
  caption: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
  media: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
  link: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          /* clipboard blocked: the wording is on screen to select */
        }
      }}
      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300"
    >
      {copied ? t("pages.teamLibrary.copied") : t("pages.teamLibrary.copy")}
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
          const r = await removeLibraryItem(fd);
          if (r.ok) onRemoved();
        })
      }
      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:border-slate-600"
    >
      {pending ? t("pages.teamLibrary.removing") : t("pages.teamLibrary.remove")}
    </button>
  );
}

function AddForm({ teamId, onAdded }: { teamId: string; onAdded: (item: LibraryItem) => void }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamLibrary.${s}`, vars);
  const [kind, setKind] = useState<LibraryKind>("caption");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

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
          fd.set("mediaUrl", mediaUrl);
          const r = await addLibraryItem(fd);
          if (r.ok) {
            onAdded(r.item);
            setTitle("");
            setBody("");
            setMediaUrl("");
            setAdded(true);
            setTimeout(() => setAdded(false), 2500);
          } else setError(r.field ? k(`error.${r.field}_${r.reason}`) : k("error.failed"));
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={k("kindLabel")}>
        {LIBRARY_KINDS.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={kind === x}
            onClick={() => setKind(x)}
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${kind === x ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {k(`kind.${x}`)}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{k("titleLabel")}</span>
        <input className={input} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={k(`titlePlaceholder.${kind}`)} required />
      </label>
      {kind === "caption" || kind === "media" ? (
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{kind === "caption" ? k("bodyLabel") : k("bodyLabelOptional")}</span>
          <textarea className={`${input} min-h-28`} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder={k("bodyPlaceholder")} required={kind === "caption"} />
          <span className="mt-1 block text-right text-xs text-slate-400 tabular-nums">
            {body.length} / {BODY_MAX}
          </span>
        </label>
      ) : null}
      {kind !== "caption" ? (
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{kind === "media" ? k("mediaUrlLabel") : k("linkUrlLabel")}</span>
          <input className={input} type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" required />
          {kind === "media" ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{k("mediaUrlHint")}</span> : null}
        </label>
      ) : null}
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

export function TeamLibraryPanel({ teamId, initial, canManage, directory }: { teamId: string; initial: LibraryItem[]; canManage: boolean; directory: MemberDirectory }) {
  const { t, i18n } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamLibrary.${s}`, vars);
  const [items, setItems] = useState<LibraryItem[]>(initial);
  const [filter, setFilter] = useState<LibraryKind | null>(null);
  const [showForm, setShowForm] = useState(false);
  const shown = filter ? items.filter((i) => i.kind === filter) : items;
  const who = (id: string) => directory[id]?.name ?? directory[id]?.email ?? null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { dateStyle: "medium" });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {k("title")}
            <span className="ml-2 text-sm font-normal text-slate-400">· {items.length}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{canManage ? k("subtitleManager") : k("subtitle")}</p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
            {showForm ? k("closeForm") : k("openForm")}
          </button>
        ) : null}
      </div>

      {canManage && showForm ? <AddForm teamId={teamId} onAdded={(item) => setItems((prev) => [item, ...prev])} /> : null}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{canManage ? k("emptyManager") : k("empty")}</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label={k("kindLabel")}>
            <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium ${filter === null ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              {k("all")}
            </button>
            {LIBRARY_KINDS.filter((x) => items.some((i) => i.kind === x)).map((x) => (
              <button key={x} type="button" aria-pressed={filter === x} onClick={() => setFilter(filter === x ? null : x)} className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium ${filter === x ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                {k(`kind.${x}`)}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {shown.map((item) => {
              const shape = mediaShape(item.mediaUrl);
              return (
                <li key={item.id} className="flex flex-col rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${KIND_TONE[item.kind]}`}>{k(`kind.${item.kind}`)}</span>
                      <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                    </div>
                    {canManage ? <RemoveButton teamId={teamId} id={item.id} onRemoved={() => setItems((prev) => prev.filter((i) => i.id !== item.id))} /> : null}
                  </div>
                  {item.mediaUrl && shape === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.mediaUrl} alt="" className="mt-2 max-h-40 w-full rounded-md object-cover" loading="lazy" />
                  ) : null}
                  {item.mediaUrl && shape === "video" ? <video src={item.mediaUrl} className="mt-2 max-h-40 w-full rounded-md" controls preload="metadata" /> : null}
                  {item.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.body}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.body ? <CopyButton text={item.body} /> : null}
                    {item.body ? (
                      <a href={composerHref(item)} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300">
                        {k("useInPost")}
                      </a>
                    ) : null}
                    {item.mediaUrl ? (
                      <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300">
                        {item.kind === "link" ? k("openLink") : k("openMedia")}
                      </a>
                    ) : null}
                    <span className="ml-auto text-xs text-slate-400">
                      {who(item.createdBy) ? k("addedBy", { name: who(item.createdBy), date: date(item.createdAt) }) : date(item.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
    </section>
  );
}

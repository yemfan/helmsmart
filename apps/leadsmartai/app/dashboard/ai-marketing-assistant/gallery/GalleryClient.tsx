"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Upload, X } from "lucide-react";
import { intlLocale } from "@/lib/i18n/locale";
import type { GalleryItem, GallerySource, GallerySummary } from "@/lib/marketing/galleryItems";

/**
 * The gallery: a filterable grid of every picture and video, a lightbox for
 * one of them, upload into the media library, and delete for library
 * uploads. Videos show a poster or their first frame with a play badge;
 * nothing autoplays in the grid.
 */

type KindFilter = "all" | "image" | "video";

const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

export default function GalleryClient({ canUpload }: { canUpload: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.gallery.${s}`, vars);

  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [summary, setSummary] = useState<GallerySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [source, setSource] = useState<GallerySource | "all">("all");
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "failed" | "needs_pro">("idle");
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "failed">("idle");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/marketing/gallery", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error();
      setItems(j.items as GalleryItem[]);
      setSummary(j.summary as GallerySummary);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the lightbox.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const visible = useMemo(
    () => (items ?? []).filter((i) => (kind === "all" || i.kind === kind) && (source === "all" || i.source === source)),
    [items, kind, source],
  );

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadState("uploading");
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", "general");
        const r = await fetch("/api/leads-gen/media/upload", { method: "POST", body });
        if (r.status === 402) {
          setUploadState("needs_pro");
          return;
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error();
      }
      setUploadState("idle");
      await load();
    } catch {
      setUploadState("failed");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(item: GalleryItem) {
    if (!item.mediaLibraryId) return;
    if (!window.confirm(k("confirmDelete"))) return;
    setDeleteState("deleting");
    try {
      const r = await fetch(`/api/leads-gen/media/${item.mediaLibraryId}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error();
      setDeleteState("idle");
      setOpen(null);
      await load();
    } catch {
      setDeleteState("failed");
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the Open link still exposes the URL.
    }
  }

  const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : null);
  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    }`;

  if (failed) {
    return <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">{k("loadFailed")}</p>;
  }
  if (!items || !summary) {
    return (
      <div className={GRID_CLASS} aria-busy>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + upload */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(kind === "all")} onClick={() => setKind("all")}>
          {k("all")} <span className="ml-1.5 text-xs opacity-70">{summary.total}</span>
        </button>
        <button type="button" className={chip(kind === "image")} onClick={() => setKind("image")}>
          {k("photos")} <span className="ml-1.5 text-xs opacity-70">{summary.images}</span>
        </button>
        <button type="button" className={chip(kind === "video")} onClick={() => setKind("video")}>
          {k("videos")} <span className="ml-1.5 text-xs opacity-70">{summary.videos}</span>
        </button>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as GallerySource | "all")}
          aria-label={k("where")}
          className="min-h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="all">{k("everySource")}</option>
          {summary.bySource.map((s) => (
            <option key={s.source} value={s.source}>
              {k(`source.${s.source}`)} ({s.count})
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <button
            type="button"
            onClick={() => (canUpload ? fileInput.current?.click() : setUploadState("needs_pro"))}
            disabled={uploadState === "uploading"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0072ce] px-3 text-sm font-semibold text-white hover:bg-[#005fa8] disabled:opacity-60"
          >
            <Upload size={15} strokeWidth={2} aria-hidden />
            {uploadState === "uploading" ? k("uploading") : k("upload")}
          </button>
        </div>
      </div>
      {uploadState === "needs_pro" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
          {k("uploadNeedsPro")}{" "}
          <Link href="/dashboard/billing" className="font-medium underline">
            {k("upgrade")}
          </Link>
        </p>
      ) : uploadState === "failed" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{k("uploadFailed")}</p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">{k("uploadHint")}</p>
      )}

      {/* Grid */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">{summary.total === 0 ? k("empty") : k("emptyFiltered")}</p>
      ) : (
        <ul className={GRID_CLASS}>
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setDeleteState("idle");
                  setOpen(item);
                }}
                className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce] dark:bg-slate-800 dark:ring-slate-700"
                aria-label={item.title ?? k(item.kind === "video" ? "video" : "photo")}
              >
                {item.kind === "video" ? (
                  item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  ) : (
                    // A media fragment makes the browser paint the first frame; a bare src stays blank until play.
                    <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  )
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                )}
                {item.kind === "video" ? (
                  <span className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play size={14} strokeWidth={2} aria-hidden />
                  </span>
                ) : null}
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-white">
                  {k(`source.${item.source}`)}
                  {item.title ? ` · ${item.title}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Lightbox */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={open.title ?? k(open.kind === "video" ? "video" : "photo")} onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{open.title ?? k("untitled")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {k(`source.${open.source}`)}
                  {open.createdAt ? ` · ${k("added", { date: dateOf(open.createdAt) })}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label={k("close")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
              {open.kind === "video" ? (
                <video src={open.url} poster={open.poster ?? undefined} controls autoPlay playsInline className="max-h-[70vh] w-auto max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.url} alt={open.title ?? ""} className="max-h-[70vh] w-auto max-w-full object-contain" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <a href={open.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                {k("open")}
              </a>
              <button type="button" onClick={() => void copyLink(open.url)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                {copied ? k("copied") : k("copy")}
              </button>
              {open.href ? (
                open.href.startsWith("/") ? (
                  <Link href={open.href} className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-[#0072ce] hover:underline">
                    {k("where")}
                  </Link>
                ) : (
                  <a href={open.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-[#0072ce] hover:underline">
                    {k("where")}
                  </a>
                )
              ) : null}
              {open.mediaLibraryId ? (
                <button type="button" onClick={() => void remove(open)} disabled={deleteState === "deleting"} className="ml-auto inline-flex min-h-9 items-center px-2 text-sm font-medium text-red-700 hover:underline disabled:opacity-60 dark:text-red-400">
                  {deleteState === "deleting" ? k("deleting") : k("delete")}
                </button>
              ) : null}
              {deleteState === "failed" ? <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">{k("deleteFailed")}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

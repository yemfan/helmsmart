"use client";

import { useTranslation } from "react-i18next";

import { useRef, useState } from "react";
import Link from "next/link";
import { Copy, Check, Sparkles, Loader2, ThumbsUp, X, Eye, Download, Send, Link2, ImagePlus } from "lucide-react";

/** Where the agent connects Facebook / LinkedIn accounts. */
const CONNECT_HREF = "/dashboard/leads/generate/connect";

/**
 * "This week's social posts" — the Marketing Assistant's weekly social queue.
 *
 * Phase 1 (drafts + queue, no real posting): shows AI-recommended post drafts
 * (1 timely from the newsletter + 2 evergreen from the shared library). An
 * autopilot toggle (Approve each ↔ Autopilot) sets the mode; "Generate this
 * week's posts" builds the queue on demand; each card can be Copied (caption +
 * hashtags + link to clipboard), Approved, or Dismissed.
 *
 * Styling matches the sibling cards on the Marketing Assistant page (rounded-xl
 * border, white bg, soft shadow).
 */

/** Mirrors SocialMode in lib/social/recommend (kept local: this is a client
 *  component and that module is server-only). */
export type SocialMode = "ask" | "review" | "assisted" | "auto";

/** Help-text keys into `dashboard:social.modeHelp.*` — module scope has no hook. */
const MODE_HELP_KEY: Record<SocialMode, string> = {
  ask: "draftsOnly",
  review: "review",
  assisted: "assisted",
  auto: "auto",
};

export type SocialRec = {
  id: string;
  week_of: string;
  source_type: "evergreen" | "timely";
  caption: string;
  hashtags: string[];
  link: string | null;
  image_prompt: string | null;
  status: "suggested" | "approved" | "dismissed" | "copied" | "scheduled";
  /** Derived URL to the auto-branded post image (/api/social/card/[id]). */
  imageUrl?: string | null;
  /** How image_url was produced: 'branded_card' | 'custom' | 'stock' | 'ai'. */
  image_source?: string | null;
};

function clipboardText(rec: SocialRec): string {
  const tags = rec.hashtags?.length ? rec.hashtags.join(" ") : "";
  return [rec.caption, tags, rec.link ?? ""].filter(Boolean).join("\n\n");
}

export default function WeeklySocialPosts({
  initialRecs,
  initialMode,
  weekOf,
  connectedPlatforms = [],
  canCustomize = false,
}: {
  initialRecs: SocialRec[];
  initialMode: SocialMode;
  weekOf: string;
  /** Human-facing labels of the agent's connected platforms (e.g. ["Facebook"]). */
  connectedPlatforms?: string[];
  /** Signature-tier: unlocks "bring your own image" + brand kit. */
  canCustomize?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [recs, setRecs] = useState<SocialRec[]>(initialRecs);
  const [mode, setMode] = useState<SocialMode>(initialMode);
  const [generating, setGenerating] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadCustomImage(rec: SocialRec, file: File) {
    setUploadingId(rec.id);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/social/recommendation/${rec.id}/media`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.imageUrl) {
        setError(json.error || t("social.errors.uploadFailed"));
        return;
      }
      const imageUrl = json.imageUrl;
      setRecs((prev) =>
        prev.map((r) =>
          r.id === rec.id ? { ...r, imageUrl, image_source: "custom" } : r,
        ),
      );
    } catch {
      setError(t("social.errors.uploadFailed"));
    } finally {
      setUploadingId(null);
    }
  }

  const hasConnection = connectedPlatforms.length > 0;
  const platformsLabel = connectedPlatforms.join(" & ");

  async function schedule(rec: SocialRec) {
    setSchedulingId(rec.id);
    setError(null);
    try {
      const res = await fetch(`/api/social/recommendation/${rec.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        needsConnection?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || t("social.errors.scheduleFailed"));
        return;
      }
      // Reflect scheduled status on the card.
      setRecs((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, status: "scheduled" } : r)),
      );
    } catch {
      setError(t("social.errors.scheduleFailed"));
    } finally {
      setSchedulingId(null);
    }
  }

  // Hide dismissed cards from the list.
  const visible = recs.filter((r) => r.status !== "dismissed");
  const previewRec = previewId ? recs.find((r) => r.id === previewId) ?? null : null;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/social/recommend", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recommendations?: SocialRec[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || t("social.errors.generateFailed"));
        return;
      }
      if (Array.isArray(json.recommendations)) setRecs(json.recommendations);
    } catch {
      setError(t("social.errors.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function changeMode(next: SocialMode) {
    if (next === mode) return;
    // 'auto' publishes with NO review — make it a deliberate choice, not an
    // accidental one. 'assisted' is the fact-checked hands-off default.
    if (
      next === "auto" &&
      !window.confirm(
        "Full autopilot posts to your accounts with NO review — nothing is fact-checked before it goes public.\n\n“Autopilot — fact-checked” gives you the same hands-off posting but claim-checks every post first. Use no-review autopilot anyway?",
      )
    ) {
      return;
    }
    setSavingMode(true);
    setError(null);
    // Optimistic.
    setMode(next);
    try {
      const res = await fetch("/api/social/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setMode(mode); // revert
        setError(t("social.errors.autopilotFailed"));
      }
    } catch {
      setMode(mode);
      setError(t("social.errors.autopilotFailed"));
    } finally {
      setSavingMode(false);
    }
  }

  async function setStatus(id: string, status: SocialRec["status"]) {
    // Optimistic update.
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await fetch(`/api/social/recommendation/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Non-fatal; the queue re-syncs on next load.
    }
  }

  async function copy(rec: SocialRec) {
    try {
      await navigator.clipboard.writeText(clipboardText(rec));
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId((c) => (c === rec.id ? null : c)), 1800);
      if (rec.status !== "approved") setStatus(rec.id, "copied");
    } catch {
      setError(t("social.errors.clipboard"));
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t("social.weeklyHeading")}</h2>
          {hasConnection ? (
            <p className="text-xs text-gray-500">{t("pages.dashFragments.aiDraftedSchedule")}{" "}
              <span className="font-medium text-gray-700">{platformsLabel}</span>, or copy to post yourself.
            </p>
          ) : (
            <p className="text-xs text-gray-500">{t("pages.dashFragments.noSocialAccount")}{" "}
              <Link href={CONNECT_HREF} className="font-medium text-[#0072ce] underline hover:no-underline">{t("pages.weeklySocial.connectToAutoPost")}</Link>
              . For now you can copy each post.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* How much rope the assistant gets. 'review' is the default posture
              worth recommending: it plans and schedules the week for you, then
              waits — the only mode that publishes with no human ever seeing the
              post is 'auto'. */}
          <label className="sr-only" htmlFor="social-mode">
            {t("social.postingMode")}
          </label>
          <select
            id="social-mode"
            value={mode}
            onChange={(e) => changeMode(e.target.value as SocialMode)}
            disabled={savingMode}
            title={t(`social.modeHelp.${MODE_HELP_KEY[mode]}`)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <option value="ask">{t("social.modes.draftsOnly")}</option>
            <option value="review">{t("social.modes.scheduleApprove")}</option>
            <option value="assisted">{t("social.modes.autopilotChecked")}</option>
            <option value="auto">{t("social.modes.autopilotNoReview")}</option>
          </select>

          {/* Generate */}
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? t("social.generating") : t("social.generate")}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {t("social.noPosts")}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((rec) => (
            <li key={rec.id} className="rounded-lg border border-gray-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    rec.source_type === "timely"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {rec.source_type === "timely" ? t("social.timely") : t("social.evergreen")}
                </span>
                {rec.status === "approved" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t("pages.weeklySocial.readyToPost")}</span>
                )}
                {rec.status === "copied" && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{t("pages.weeklySocial.copied")}</span>
                )}
                {rec.status === "scheduled" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-medium text-[#0072ce]">
                    <Check className="h-3 w-3" />{t("pages.weeklySocial.scheduled")}</span>
                )}
              </div>

              <div className="flex gap-3">
                {rec.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewId(rec.id)}
                    className="group relative hidden shrink-0 overflow-hidden rounded-lg border border-gray-200 sm:block"
                    title={t("social.previewFinished")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rec.imageUrl}
                      alt={t("social.brandedImage")}
                      loading="lazy"
                      width={96}
                      height={96}
                      className="h-24 w-24 object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                      <Eye className="h-5 w-5" />
                    </span>
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-sm text-gray-900">{rec.caption}</p>

                  {rec.hashtags?.length > 0 && (
                    <p className="mt-2 text-xs text-blue-600">{rec.hashtags.join(" ")}</p>
                  )}
                </div>
              </div>

              {rec.link && (
                <a
                  href={rec.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-gray-500 underline-offset-2 hover:underline"
                >
                  {rec.link}
                </a>
              )}

              {rec.image_prompt && (
                <p className="mt-2 text-xs text-gray-400">
                  <span className="font-medium text-gray-500">{t("social.imageIdea")}</span> {rec.image_prompt}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rec.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewId(rec.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      rec.status === "approved"
                        ? "bg-[#0072ce] text-white shadow-sm hover:bg-[#005fab]"
                        : "border border-[#0072ce]/30 bg-[#0072ce]/5 text-[#0072ce] hover:bg-[#0072ce]/10"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />{t("pages.weeklySocial.preview")}</button>
                )}

                <button
                  type="button"
                  onClick={() => copy(rec)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedId === rec.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedId === rec.id ? t("social.copied") : "Copy"}
                </button>

                {/* Schedule to social — the glue to the real publish engine. */}
                {!hasConnection ? (
                  <Link
                    href={CONNECT_HREF}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#0072ce]/30 bg-[#0072ce]/5 px-2.5 py-1 text-xs font-medium text-[#0072ce] hover:bg-[#0072ce]/10"
                  >
                    <Link2 className="h-3.5 w-3.5" />{t("pages.weeklySocial.connectAccount")}</Link>
                ) : rec.status === "scheduled" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#0072ce]/20 bg-[#0072ce]/5 px-2.5 py-1 text-xs font-medium text-[#0072ce]">
                    <Check className="h-3.5 w-3.5" />{t("pages.weeklySocial.scheduled")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => schedule(rec)}
                    disabled={schedulingId === rec.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0072ce] px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-[#005fab] disabled:opacity-60"
                  >
                    {schedulingId === rec.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {schedulingId === rec.id ? "Scheduling…" : `Schedule to ${platformsLabel}`}
                  </button>
                )}

                {rec.status !== "approved" && rec.status !== "scheduled" && (
                  <button
                    type="button"
                    onClick={() => setStatus(rec.id, "approved")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />{t("pages.weeklySocial.approve")}</button>
                )}

                <button
                  type="button"
                  onClick={() => setStatus(rec.id, "dismissed")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" />{t("pages.weeklySocial.dismiss")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-gray-400">{t("social.weekOf", { week: weekOf })}</p>

      {/* Finished-post preview modal */}
      {previewRec && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setPreviewId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("social.postPreview")}
        >
          <div
            className="my-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{t("social.postPreview")}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    previewRec.source_type === "timely"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {previewRec.source_type === "timely" ? t("social.timely") : t("social.evergreen")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t("social.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Finished post body */}
            <div className="px-4 py-4">
              {previewRec.imageUrl && (
                <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewRec.imageUrl}
                    alt={t("social.brandedImage")}
                    className="block aspect-square w-full object-cover"
                  />
                </div>
              )}

              <p className="mt-4 whitespace-pre-line text-sm text-gray-900">
                {previewRec.caption}
              </p>

              {previewRec.hashtags?.length > 0 && (
                <p className="mt-2 text-sm text-[#0072ce]">{previewRec.hashtags.join(" ")}</p>
              )}

              {previewRec.link && (
                <p className="mt-2 truncate text-xs text-gray-500">{previewRec.link}</p>
              )}

              {canCustomize ? (
                <div className="mt-4 rounded-lg border border-[#0072ce]/20 bg-[#0072ce]/[0.04] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#0072ce]">{t("social.useOwnImage")}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">{t("pages.weeklySocial.replaceCard")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingId === previewRec.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0072ce] px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#005fab] disabled:opacity-60"
                    >
                      {uploadingId === previewRec.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      {uploadingId === previewRec.id ? "Uploading…" : t("social.uploadImage")}
                    </button>
                  </div>
                  {previewRec.image_source === "custom" && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Check className="h-3 w-3" />{t("pages.weeklySocial.usingUpload")}</p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Reset so re-selecting the same file re-triggers onChange.
                      e.target.value = "";
                      if (f) void uploadCustomImage(previewRec, f);
                    }}
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-[#0072ce]/20 bg-[#0072ce]/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
                  <span className="font-semibold text-[#0072ce]">{t("social.signature")}</span>: swap in
                  your own photo or short video and put your logo &amp; colors on every post.{" "}
                  <a href="/dashboard/billing" className="font-semibold text-[#0072ce] underline hover:no-underline">
                    Upgrade →
                  </a>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => copy(previewRec)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#005fab]"
              >
                {copiedId === previewRec.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedId === previewRec.id ? t("social.copied") : t("social.copyCaption")}
              </button>

              {previewRec.imageUrl && (
                <a
                  href={previewRec.imageUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" />{t("pages.weeklySocial.downloadImage")}</a>
              )}

              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="ml-auto inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
              >{t("pages.weeklySocial.close")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

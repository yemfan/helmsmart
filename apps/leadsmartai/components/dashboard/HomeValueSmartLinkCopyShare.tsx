"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Share2 } from "lucide-react";

function absoluteUrl(relativePath: string): string {
  if (typeof window === "undefined") return relativePath;
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${window.location.origin}${path}`;
}

type Props = {
  /** Path starting with `/`, e.g. `/home-value-widget?agentId=...` */
  relativePath: string;
  /** Optional compact icon-only layout */
  compact?: boolean;
  /**
   * Render the link itself in a read-only box above the buttons. The box shows
   * the SAME absolute URL the buttons copy - a bare path pasted into a browser
   * or a social bio is treated as a search query, not a link.
   */
  showUrl?: boolean;
};

export default function HomeValueSmartLinkCopyShare({ relativePath, compact = false, showUrl = false }: Props) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  const [shareHint, setShareHint] = useState(false);
  // The origin is only knowable in the browser, so the first paint shows the
  // path and the effect upgrades it. Deriving it from window rather than an
  // env var means the box always matches the host the agent is actually on.
  const [displayUrl, setDisplayUrl] = useState(relativePath);
  useEffect(() => {
    setDisplayUrl(absoluteUrl(relativePath));
  }, [relativePath]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl(relativePath));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [relativePath]);

  const shareLink = useCallback(async () => {
    const url = absoluteUrl(relativePath);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Home Value",
          text: "Get your home value estimate",
          url,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await copyLink();
        }
      }
      return;
    }
    await copyLink();
    setShareHint(true);
    setTimeout(() => setShareHint(false), 2500);
  }, [relativePath, copyLink]);

  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce] focus-visible:ring-offset-2 disabled:opacity-60";

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnBase} onClick={copyLink} aria-label={t("pages.smartLinkShare.copyFull")}>
          <Copy className="h-4 w-4 shrink-0" />
          <span className="sr-only sm:not-sr-only">{copied ? t("common:actions.copied_bang") : t("common:actions.copy")}</span>
        </button>
        <button type="button" className={btnBase} onClick={shareLink} aria-label={t("pages.smartLinkShare.shareLink")}>
          <Share2 className="h-4 w-4 shrink-0" />
          <span className="sr-only sm:not-sr-only">{t("pages.smartLinkShare.share")}</span>
        </button>
        {(copied || shareHint) && (
          <span className="text-xs font-medium text-emerald-600" role="status">
            {copied ? t("pages.homeValueSmartLinkCopyShare.fullUrlCopied") : t("pages.homeValueSmartLinkCopyShare.linkCopiedUseShare")}
          </span>
        )}
      </div>
    );
  }

  const urlBox = showUrl ? (
    <input
      readOnly
      value={displayUrl}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
      aria-label={t("pages.smartLinkShare.copyFull")}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-700"
    />
  ) : null;

  return (
    <div className="flex flex-col gap-2">
      {urlBox}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <button type="button" className={btnBase} onClick={copyLink}>
        <Copy className="h-4 w-4 shrink-0" />
        {copied ? t("common:actions.copied_bang") : t("common:actions.copy_link")}
      </button>
      <button type="button" className={btnBase} onClick={shareLink}>
        <Share2 className="h-4 w-4 shrink-0" />{t("pages.smartLinkShare.share")}</button>
      {shareHint && !copied && (
        <span className="text-xs text-slate-600" role="status">{t("pages.smartLinkShare.copiedNote")}</span>
      )}
      </div>
    </div>
  );
}

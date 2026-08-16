"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { trackLandingEvent } from "@/lib/marketing/landingTrack";

export type VslSectionProps = {
  id?: string;
  title?: string;
  subtitle?: string;
  videoType?: "youtube" | "vimeo" | "html5";
  /** YouTube/Vimeo id, or full URL for HTML5 MP4 */
  videoIdOrUrl: string;
  ctaText?: string;
  ctaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  trustText?: string;
};

export default function VslSection({
  id = "vsl",
  title = "See How CloseBoss Works in 60 Seconds",
  subtitle = "Watch how agents turn online traffic into qualified leads and closed deals — automatically.",
  videoType = "youtube",
  videoIdOrUrl,
  ctaText = "Get My First Leads",
  ctaHref = "/onboarding",
  secondaryCtaText = "View Pricing",
  secondaryCtaHref = "#pricing",
  trustText = "No setup required • Works in minutes • Built for agents and brokers",
}: VslSectionProps) {
  const { t } = useTranslation("dashboard");
  const [isPlaying, setIsPlaying] = useState(false);

  const hasSource = Boolean(videoIdOrUrl?.trim());

  // Don't render anything if no video is configured — avoids showing dev note to users
  if (!hasSource) return null;

  const emitPlay = useCallback(() => {
    trackLandingEvent("vsl_play_clicked", {
      video_type: videoType,
      section: "homepage_vsl",
    });
    setIsPlaying(true);
  }, [videoType]);

  const emitCta = useCallback(
    (kind: "primary" | "secondary", href: string) => {
      trackLandingEvent("vsl_cta_clicked", {
        section: "homepage_vsl",
        kind,
        href,
      });
    },
    []
  );

  const renderVideo = () => {
    if (!isPlaying || !hasSource) return null;

    const idOrUrl = videoIdOrUrl.trim();

    if (videoType === "youtube") {
      return (
        <iframe
          className="absolute inset-0 h-full w-full rounded-2xl"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(idOrUrl)}?autoplay=1&rel=0&modestbranding=1`}
          title={t("pages.vsl.videoAlt")}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      );
    }

    if (videoType === "vimeo") {
      return (
        <iframe
          className="absolute inset-0 h-full w-full rounded-2xl"
          src={`https://player.vimeo.com/video/${encodeURIComponent(idOrUrl)}?autoplay=1&dnt=1`}
          title={t("pages.vsl.videoAlt")}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      );
    }

    return (
      <video
        className="absolute inset-0 h-full w-full rounded-2xl object-cover"
        src={idOrUrl}
        controls
        autoPlay
        playsInline
      />
    );
  };

  return (
    <section id={id} className="scroll-mt-24 px-6 py-16 md:scroll-mt-28 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
          <p className="mt-4 text-base text-gray-600 md:text-lg">{subtitle}</p>
        </div>

        <div className="mt-10">
          <div className="relative mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl border border-slate-800/80 bg-black shadow-2xl">
            {!isPlaying && (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_45%)]" />

                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
                  <div className="mb-6 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.2em] text-white/80">{t("pages.vsl.label")}</div>

                  <h3 className="max-w-3xl font-heading text-2xl font-semibold md:text-4xl">{t("pages.vsl.headline")}</h3>

                  <p className="mt-4 max-w-2xl text-sm text-white/80 md:text-base">{t("pages.vsl.sub")}</p>

                  <button
                    type="button"
                    onClick={hasSource ? emitPlay : undefined}
                    disabled={!hasSource}
                    className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-6 py-4 font-semibold text-slate-900 shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t("pages.vsl.playVideo")}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                      ▶
                    </span>{t("pages.vsl.play60")}</button>
                  {!hasSource ? (
                    <p className="mt-4 max-w-md text-xs text-amber-200/90">
                      {t("pages.vsl.missingEnvBefore")} <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_VSL_YOUTUBE_ID</code> {t("pages.vsl.missingEnvAfter")}
                    </p>
                  ) : null}
                </div>
              </>
            )}

            {renderVideo()}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-gray-500">{trustText}</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              href={ctaHref}
              className="min-h-12 px-6 py-3 text-base"
              onClick={() => emitCta("primary", ctaHref)}
            >
              {ctaText}
            </Button>

            <Button
              href={secondaryCtaHref}
              variant="outline"
              className="min-h-12 px-6 py-3 text-base"
              onClick={() => emitCta("secondary", secondaryCtaHref)}
            >
              {secondaryCtaText}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

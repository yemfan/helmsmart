"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Create & post a video reel manually — render a vertical video (AI-generated
 * brand content or a quick sample), preview the MP4, pick which connected
 * accounts to post to, then publish. Talks to /api/social/reel/test
 * (POST render, GET ?targets / ?reelId&publish).
 *
 * Rendering is async on Remotion Lambda (~1-2 min) so the panel polls. Publish
 * is a deliberate second step — posting is irreversible, so you preview the
 * video and choose platforms first. Signature/Team gated (API enforces it too).
 */

type Phase = "idle" | "rendering" | "rendered" | "publishing" | "done" | "error";
type Platform = "facebook" | "instagram" | "linkedin";
type PublishResult = { platform: string; ok: boolean; url?: string | null; error?: string };

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export default function ReelTestPanel({ canCustomize }: { canCustomize: boolean }) {
  const { t } = useTranslation("dashboard");
  const [phase, setPhase] = useState<Phase>("idle");
  const [reelId, setReelId] = useState<string | null>(null);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [targets, setTargets] = useState<Platform[]>([]);
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the connected, video-capable platforms → the publish checkboxes.
  useEffect(() => {
    if (!canCustomize) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/social/reel/test?targets=1");
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok && Array.isArray(json.platforms)) {
          setTargets(json.platforms);
          setSelected(new Set(json.platforms));
        }
      } catch {
        /* leave empty — publish step will report if none */
      }
    })();
    return () => {
      alive = false;
    };
  }, [canCustomize]);

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/social/reel/test?reelId=${encodeURIComponent(id)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase("error");
        setError(json.error || "Render failed.");
        return;
      }
      if (json.status === "rendering") {
        setProgress(typeof json.progress === "number" ? json.progress : 0);
        pollTimer.current = setTimeout(() => poll(id), 6000);
        return;
      }
      if (json.status === "rendered" && json.mp4Url) {
        setMp4Url(json.mp4Url);
        setPhase("rendered");
      }
    } catch {
      setPhase("error");
      setError("Network error while polling the render.");
    }
  }, []);

  const startRender = useCallback(async () => {
    setPhase("rendering");
    setError(null);
    setResults(null);
    setMp4Url(null);
    setProgress(0);
    try {
      const res = await fetch("/api/social/reel/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: useAi }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase("error");
        setError(json.error || "Could not start the render.");
        return;
      }
      setReelId(json.reelId);
      poll(json.reelId);
    } catch {
      setPhase("error");
      setError("Network error starting the render.");
    }
  }, [poll, useAi]);

  const publish = useCallback(async () => {
    if (!reelId || selected.size === 0) return;
    setPhase("publishing");
    setError(null);
    try {
      const platforms = Array.from(selected).join(",");
      const res = await fetch(
        `/api/social/reel/test?reelId=${encodeURIComponent(reelId)}&publish=1&platforms=${platforms}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase("error");
        setError(json.error || "Publish failed.");
        return;
      }
      setResults(Array.isArray(json.published) ? json.published : []);
      setPhase("done");
    } catch {
      setPhase("error");
      setError("Network error while publishing.");
    }
  }, [reelId, selected]);

  const toggle = (p: Platform) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t("pages.reelPanel.title")}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{t("pages.reelPanel.intro")}</p>
        </div>
        {canCustomize && (phase === "idle" || phase === "error" || phase === "done") ? (
          <button
            type="button"
            onClick={startRender}
            className="shrink-0 rounded-lg bg-[#0072ce] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#005ba8]"
          >
            {phase === "done" || phase === "error" ? t("pages.reelTest.renderAnother") : t("pages.reelTest.renderReel")}
          </button>
        ) : null}
      </div>

      {!canCustomize ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("pages.reelPanel.signatureOnly")}</div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Content source */}
          {phase === "idle" || phase === "error" || phase === "done" ? (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={useAi} onChange={() => setUseAi(true)} />
                <span className="text-gray-700">{t("pages.reelPanel.aiBrandReel")}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!useAi} onChange={() => setUseAi(false)} />
                <span className="text-gray-700">{t("pages.reelPanel.quickSample")}</span>
              </label>
            </div>
          ) : null}

          {phase === "rendering" ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {t("pages.reelTest.rendering", { pct: Math.round(progress * 100) })}
              <span className="mt-1 block text-xs text-gray-400">{t("pages.reelPanel.takesAMinute")}</span>
            </div>
          ) : null}

          {mp4Url ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={mp4Url} controls playsInline className="mx-auto max-h-[420px] w-auto" />
            </div>
          ) : null}

          {phase === "rendered" ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">{t("pages.reelPanel.postTo")}</p>
                {targets.length === 0 ? (
                  <p className="text-sm text-amber-700">{t("pages.reelPanel.noAccounts")}</p>
                ) : (
                  <div className="flex flex-wrap gap-4 text-sm">
                    {targets.map((p) => (
                      <label key={p} className="flex items-center gap-2">
                        <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} />
                        <span className="text-gray-700">{PLATFORM_LABEL[p]}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={publish}
                  disabled={selected.size === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >{t("pages.reelPanel.publishNow")}</button>
                <span className="text-xs text-gray-400">{t("pages.reelPanel.publishHint")}</span>
              </div>
            </div>
          ) : null}

          {phase === "publishing" ? <p className="text-sm text-gray-500">{t("pages.reelTest.publishing")}</p> : null}

          {phase === "done" && results ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-medium text-gray-700">{t("pages.reelPanel.results")}</p>
              <ul className="space-y-1 text-sm">
                {results.map((r) => (
                  <li key={r.platform} className="flex items-center gap-2">
                    <span className={r.ok ? "text-emerald-600" : "text-red-600"}>{r.ok ? "✓" : "✗"}</span>
                    <span className="capitalize text-gray-700">{r.platform}</span>
                    {r.ok && r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-[#0072ce] underline">{t("pages.reelPanel.viewPost")}</a>
                    ) : (
                      <span className="text-gray-500">{r.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      )}
    </section>
  );
}

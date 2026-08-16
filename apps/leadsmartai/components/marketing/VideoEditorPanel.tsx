"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

/**
 * Video editor — upload a raw clip, and we wrap it into a publish-ready branded
 * vertical reel (intro hook → your video cropped to 9:16 with a CLOSEBOSS
 * watermark → CTA outro) via Remotion Lambda, then it flows into the reel
 * publish queue. Signature/Team gated (API enforces it too).
 *
 * The browser reads the clip's duration (so the render knows its length) and
 * uploads it straight to storage (bypassing the serverless body cap); the render
 * route triggers the Lambda job and the existing reel poll/publish tick finishes.
 */

const MAX_SECONDS = 90;

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video."));
    };
    v.src = url;
  });
}

export default function VideoEditorPanel({ canCustomize }: { canCustomize: boolean }) {
  const { t } = useTranslation("dashboard");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [hook, setHook] = useState("New listing just dropped");
  const [cta, setCta] = useState("See how it works");
  const [caption, setCaption] = useState("");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [aiCopy, setAiCopy] = useState(false);
  const [silenceCut, setSilenceCut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(async (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setMsg({ kind: "err", text: "Please choose a video file." });
      return;
    }
    setFile(f);
    try {
      const secs = await readDuration(f);
      setDuration(secs);
      if (secs > MAX_SECONDS) {
        setMsg({ kind: "err", text: `That clip is ${Math.round(secs)}s — we'll use the first ${MAX_SECONDS}s.` });
      }
    } catch {
      setDuration(null);
    }
  }, []);

  const create = useCallback(async () => {
    if (!file || !duration) return;
    setBusy(true);
    setMsg(null);
    try {
      const videoPath = await uploadViaStorage(file, "video_upload");
      const res = await fetch("/api/social/video/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoPath,
          videoDurationSeconds: duration,
          // When AI is writing, send blanks so it fills them from the transcript.
          hook: aiCopy ? "" : hook,
          cta: aiCopy ? "" : cta,
          caption: aiCopy ? "" : caption || hook,
          captions: captionsOn,
          aiCopy,
          silenceCut,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not start the render.");
      setMsg({
        kind: "ok",
        text: "Rendering your branded reel — it'll appear in your Post queue when it's ready (about a minute or two).",
      });
      setFile(null);
      setDuration(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }, [file, duration, hook, cta, caption, captionsOn, aiCopy, silenceCut]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t("pages.videoEditor.title")}</h3>
        <p className="mt-0.5 text-sm text-gray-500">{t("pages.videoEditor.intro")}</p>
      </div>

      {!canCustomize ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("pages.videoEditor.signatureOnly")}</div>
      ) : (
        <div className="mt-4 space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={(e) => pick(e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0072ce] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-[#005ba8]"
          />
          {file && duration ? (
            <p className="text-xs text-gray-500">
              {file.name} · {Math.round(duration)}s
            </p>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={captionsOn} onChange={(e) => setCaptionsOn(e.target.checked)} className="h-4 w-4" />
              Auto‑captions (burn subtitles into the video)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={aiCopy} onChange={(e) => setAiCopy(e.target.checked)} className="h-4 w-4" />{t("pages.videoEditor.aiWrites")}</label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={silenceCut} onChange={(e) => setSilenceCut(e.target.checked)} className="h-4 w-4" />{t("pages.videoEditor.cutSilence")}</label>
          </div>

          {aiCopy ? (
            <p className="text-xs text-gray-500">{t("pages.videoEditor.aiWatchNote")}</p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">{t("pages.videoEditor.introHook")}</span>
                <input type="text" value={hook} onChange={(e) => setHook(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-1 focus:ring-[#0072ce]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">{t("pages.videoEditor.ctaOutro")}</span>
                <input type="text" value={cta} onChange={(e) => setCta(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-1 focus:ring-[#0072ce]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">{t("pages.videoEditor.postCaption")}</span>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder={t("pages.videoEditor.captionPlaceholder")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-1 focus:ring-[#0072ce]" />
              </label>
            </>
          )}

          {msg ? (
            <div className={`rounded-lg px-4 py-2.5 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</div>
          ) : null}

          <button
            type="button"
            onClick={create}
            disabled={busy || !file || !duration}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#005ba8] disabled:opacity-50"
          >
            {busy ? "Uploading & rendering…" : "Create branded reel"}
          </button>
        </div>
      )}
    </section>
  );
}

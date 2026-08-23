"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { createClient } from "@/lib/supabase/client";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Ad photo pool manager — upload brand/lifestyle photos that the Marketing
 * Assistant rotates into branded photo ads (logo + headline + CTA overlaid).
 * Talks to /api/social/ad/photos (GET list, POST upload, DELETE [id]).
 *
 * Signature/Team gated: when `canCustomize` is false we show an upgrade note and
 * disable uploads (the API also enforces it).
 */

type AdPhoto = { id: string; url: string; label: string | null };

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";

export default function AdPhotoPanel({ canCustomize }: { canCustomize: boolean }) {
  const { t } = useTranslation("dashboard");
  const [photos, setPhotos] = useState<AdPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/social/ad/photos");
        if (res.ok) {
          const json = await res.json();
          if (alive) setPhotos(Array.isArray(json.photos) ? json.photos : []);
        }
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      setError(null);
      setBusy(true);
      try {
        const supa = createClient();
        for (const file of list) {
          if (file.size > MAX_BYTES) {
            setError(`"${file.name}" is over 8MB — skipped.`);
            continue;
          }
          let res: Response;
          if (supa) {
            // Upload straight to Storage (bypasses Vercel's ~4.5 MB body cap),
            // then index the stored image.
            const signRes = await fetch("/api/dashboard/uploads/sign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kind: "ad_photo", fileName: file.name }),
            });
            const sign = await signRes.json().catch(() => ({}));
            if (!signRes.ok || !sign.ok) {
              setError(sign.error || "Upload failed.");
              continue;
            }
            const up = await supa.storage
              .from(sign.bucket)
              .uploadToSignedUrl(sign.path, sign.token, file, {
                contentType: file.type || undefined,
              });
            if (up.error) {
              setError(up.error.message || "Upload failed.");
              continue;
            }
            res = await fetch("/api/social/ad/photos", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ storagePath: sign.path }),
            });
          } else {
            const form = new FormData();
            form.append("file", file);
            res = await fetch("/api/social/ad/photos", { method: "POST", body: form });
          }
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(json.error || "Upload failed.");
            continue;
          }
          if (json.id && json.url) {
            setPhotos((prev) => [{ id: json.id, url: json.url, label: null }, ...prev]);
          }
        }
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id)); // optimistic
    try {
      await fetch(`/api/social/ad/photos/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort; a failed delete just reappears on refresh */
    }
  }, []);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t("pages.adPhotos.title")}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{t("pages.adPhotos.intro")}</p>
        </div>
        {canCustomize ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="shrink-0 rounded-lg bg-[#0072ce] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#005ba8] disabled:opacity-60"
          >
            {busy ? t("common:status.uploading") : t("common:actions.upload")}
          </button>
        ) : null}
      </div>

      {!canCustomize ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("pages.adPhotos.signatureOnly")}</div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragOver ? "border-[#0072ce] bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-[#0072ce]"
            }`}
          >
            <span className="text-sm font-medium text-gray-700">{t("pages.adPhotos.drop")}</span>
            <span className="mt-1 text-xs text-gray-400">PNG, JPG, or WebP · up to 8MB each</span>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-gray-400"><LoadingText /></p>
            ) : photos.length === 0 ? (
              <p className="text-sm text-gray-400">{t("pages.adPhotos.empty")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((p) => (
                  <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.label ?? ""} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label={t("pages.adPhotos.removeAlt")}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/75"
                    >{t("pages.adPhotos.remove")}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

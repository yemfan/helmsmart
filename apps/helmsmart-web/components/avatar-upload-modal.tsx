"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { uploadAvatar } from "@/lib/actions/profile";

/**
 * Profile-picture upload modal opened from the account menu. Previews the chosen image,
 * uploads via the uploadAvatar action, then refreshes so the sidebar avatar updates.
 */
export function AvatarUploadModal({ currentUrl, onClose }: { currentUrl?: string | null; onClose: () => void }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [state, action, pending] = useActionState(uploadAvatar, null);
  const [preview, setPreview] = useState<string | null>(null);
  const ok = state !== null && "ok" in state;

  useEffect(() => {
    if (!ok) return;
    router.refresh();
    const t = setTimeout(onClose, 900);
    return () => clearTimeout(t);
  }, [ok, onClose, router]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900 mb-1">{t("avatar.title")}</h2>
        <p className="text-xs text-slate-500 mb-4">{t("avatar.subtitle")}</p>

        <form action={action} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-slate-400">{t("avatar.noPhoto")}</span>
              )}
            </div>
            <label className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {t("avatar.choose")}
              <input name="file" type="file" accept="image/*" onChange={onPick} className="hidden" />
            </label>
          </div>

          {state !== null && "error" in state && <p className="text-xs text-rose-600">{state.error}</p>}
          {ok && <p className="text-xs text-emerald-700">{t("avatar.updated")}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">
              {t("common:actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {pending ? t("common:status.uploading") : t("avatar.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

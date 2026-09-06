"use client";

import { useTranslation } from "react-i18next";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

type Branding = {
  brandName: string;
  signatureHtml: string;
  logoUrl: string;
  /**
   * Agent photo for email signatures.
   *
   * The upload UI for this field was retired — agents now upload their
   * headshot once on the Profile page (user_profiles.avatar_url) and
   * signatures read that. This field stays in the DTO so signatures
   * rendered for agents who uploaded pre-retirement keep working until
   * a backfill copies those URLs into avatar_url.
   */
  agentPhotoUrl: string;
  /**
   * Per-broker default for the Meta Lead Ad form's privacy policy URL.
   * Empty string = use the CloseBoss bundled default. Brokerages with
   * their own privacy policy should set this so all Lead Ads they
   * launch via Generate Leads point to their compliance page.
   */
  leadAdPrivacyPolicyUrl: string;
};

const empty: Branding = {
  brandName: "",
  signatureHtml: "",
  logoUrl: "",
  agentPhotoUrl: "",
  leadAdPrivacyPolicyUrl: "",
};

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; html: string; text: string; isCustom: boolean }
  | { kind: "error"; msg: string };

export default function BrandingSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const [branding, setBranding] = useState<Branding>(empty);
  const [saved, setSaved] = useState<Branding>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingSignature, setEditingSignature] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isDirty =
    branding.brandName !== saved.brandName ||
    branding.signatureHtml !== saved.signatureHtml ||
    branding.logoUrl !== saved.logoUrl ||
    branding.agentPhotoUrl !== saved.agentPhotoUrl ||
    branding.leadAdPrivacyPolicyUrl !== saved.leadAdPrivacyPolicyUrl;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/branding");
      const body = await res.json().catch(() => ({}));
      if (body.ok && body.branding) {
        setBranding(body.branding);
        setSaved(body.branding);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("branding.saveFailed"));
      setSaved({ ...branding });
      setMessage(t("branding.saved"));
      setEditingSignature(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("branding.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(
    file: File,
    slot: "logo" | "photo",
  ): Promise<string | null> {
    if (file.size > 2 * 1024 * 1024) {
      setError(`${slot === "logo" ? "Logo" : "Photo"} must be under 2MB.`);
      return null;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError(t("branding.signInRequired"));
        return null;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/${slot}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || "image/png",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      return urlData.publicUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("branding.uploadFailed"));
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadLogo(file: File) {
    const publicUrl = await uploadImage(file, "logo");
    if (!publicUrl) return;
    setBranding((b) => ({ ...b, logoUrl: publicUrl }));
    await fetch("/api/dashboard/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: publicUrl }),
    });
    setSaved((s) => ({ ...s, logoUrl: publicUrl }));
    setMessage(t("branding.logoUploaded"));
    setPreview({ kind: "idle" });
  }

  function removeLogo() {
    setBranding((b) => ({ ...b, logoUrl: "" }));
  }

  /**
   * Fetch a server-rendered preview using the composer in
   * lib/signatures/compose.ts. Includes in-flight unsaved edits so the
   * agent sees exactly what their current draft will produce.
   */
  async function loadPreview() {
    setPreview({ kind: "loading" });
    try {
      const res = await fetch("/api/dashboard/branding/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: branding.brandName,
          signatureHtml: branding.signatureHtml,
          logoUrl: branding.logoUrl,
          agentPhotoUrl: branding.agentPhotoUrl,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        signature?: { html: string; text: string; isCustom: boolean };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.signature) {
        throw new Error(body.error || t("branding.previewFailed"));
      }
      setPreview({
        kind: "ready",
        html: body.signature.html,
        text: body.signature.text,
        isCustom: body.signature.isCustom,
      });
    } catch (e) {
      setPreview({ kind: "error", msg: e instanceof Error ? e.message : t("branding.previewFailed") });
    }
  }

  if (loading) {
    return <div className="text-sm text-slate-500 py-4">{t("branding.loading")}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Brand Name */}
      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-slate-500">{t("branding.brandName")}</label>
        <input
          value={branding.brandName}
          onChange={(e) => setBranding((b) => ({ ...b, brandName: e.target.value }))}
          placeholder={t("branding.brandNamePlaceholder")}
          maxLength={200}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-slate-500">
          {t("branding.brandNameHelp")}
        </p>
      </div>

      {/* Agent photo upload retired — the circular headshot in email
          signatures now comes from user_profiles.avatar_url, which the
          agent sets once via t("branding.changePhoto") at the top of this Profile
          page. Having two upload spots caused agents to expect they
          needed to upload the same image twice, and caused signatures
          to show a stale image if the profile photo was updated but
          the branding photo wasn't. Only the brokerage logo remains. */}
      <div className="grid gap-5">
        {/* Brokerage logo */}
        <div className="space-y-2">
          <label className="block text-[11px] font-medium text-slate-500">
            {t("branding.logoLabel")} <span className="text-slate-400 font-normal">{t("branding.optional")}</span>
          </label>
          {branding.logoUrl ? (
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <img
                  src={branding.logoUrl}
                  alt={t("branding.logoAlt")}
                  className="max-h-12 max-w-[140px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "";
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploading ? t("branding.uploading") : t("branding.change")}
                </button>
                <button
                  type="button"
                  onClick={removeLogo}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t("branding.remove")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-slate-500 hover:border-blue-400 hover:bg-blue-50/30 disabled:opacity-50"
            >
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {uploading ? t("branding.uploading") : t("branding.uploadLogo")}
            </button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
              e.target.value = "";
            }}
          />
          <p className="text-[11px] text-slate-500">
            {t("branding.logoHelp")}
          </p>
        </div>
      </div>

      {/* Email Signature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-medium text-slate-500">{t("branding.emailSignature")}</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadPreview()}
              disabled={preview.kind === "loading"}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {preview.kind === "loading" ? t("pages.brandingSettings.loadingPreview") : t("branding.preview")}
            </button>
            {!editingSignature && (
              <button
                type="button"
                onClick={() => setEditingSignature(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {t("branding.change")}
              </button>
            )}
          </div>
        </div>

        {editingSignature ? (
          <div className="space-y-2">
            <textarea
              value={branding.signatureHtml}
              onChange={(e) => setBranding((b) => ({ ...b, signatureHtml: e.target.value }))}
              placeholder={t("branding.signaturePlaceholder")}
              maxLength={2000}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <p className="text-[11px] text-slate-500">{t("pages.branding.signatureHint")}</p>
            <button
              type="button"
              onClick={() => {
                setEditingSignature(false);
                setBranding((b) => ({ ...b, signatureHtml: saved.signatureHtml }));
                setPreview({ kind: "idle" });
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >{t("pages.branding.cancel")}</button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 text-xs text-slate-500">
            {branding.signatureHtml ? (
              <>{t("branding.customSet")} <span className="font-medium">{t("branding.preview")}</span> {t("branding.previewTail")} <span className="font-medium">{t("branding.change")}</span> {t("branding.editTail")}</>
            ) : (
              <>{t("branding.usingDefault")} <span className="font-medium">{t("branding.preview")}</span> {t("branding.previewTail")} <span className="font-medium">{t("branding.change")}</span> {t("branding.customizeTail")}</>
            )}
          </div>
        )}

        {/* Rendered preview — shown under either editor or the default hint */}
        {preview.kind === "ready" && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("branding.previewHeader")}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    preview.isCustom
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {preview.isCustom ? t("branding.custom") : t("branding.default")}
                </span>
                <button
                  type="button"
                  onClick={() => setPreview({ kind: "idle" })}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                >
                  {t("branding.hide")}
                </button>
              </div>
            </div>
            <div className="rounded border border-slate-100 bg-white p-4">
              <div className="text-sm text-slate-700">
                <em className="text-slate-400">
                  {t("branding.bodyEndsHere")}
                </em>
              </div>
              <div
                className="mt-2 text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview.html) }}
              />
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700">
                {t("branding.plainTextVariant")}
              </summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-600">
{preview.text}
              </pre>
            </details>
          </div>
        )}

        {preview.kind === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {preview.msg}
          </div>
        )}
      </div>

      {/* Lead Ad — privacy policy URL override */}
      <div className="space-y-2">
        {/*
          No PREMIUM badge. This field was never gated — no `disabled` here, no
          entitlement check in the PATCH route — so the badge advertised a
          paywall that did not exist. It also contradicts the usage-based model
          (everything included, credits are the only gate), which the avatar
          flags were updated for and this one was missed.

          It matters that it stays open to everyone: this points Meta Lead Ad
          forms at the agent's OWN brokerage privacy policy. An agent who skips
          it because it looks paid runs lead ads against our bundled URL, which
          is worse for their compliance than for our revenue.
        */}
        <label className="block text-[11px] font-medium text-slate-500">
          {t("branding.leadAdUrl")}
        </label>
        <input
          type="url"
          value={branding.leadAdPrivacyPolicyUrl}
          onChange={(e) =>
            setBranding((b) => ({
              ...b,
              leadAdPrivacyPolicyUrl: e.target.value,
            }))
          }
          placeholder={t("branding.leadAdPlaceholder")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="text-[11px] text-slate-500">
          {t("branding.leadAdHelp")}
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          className="rounded-lg bg-brand-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? t("branding.saving") : t("branding.save")}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

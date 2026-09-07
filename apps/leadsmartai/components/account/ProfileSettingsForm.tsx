"use client";

import { useTranslation } from "react-i18next";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatUserRoleLabel } from "@leadsmart/shared";
import { uploadProfilePhotoWithSessionClient } from "@/lib/profileAvatarClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { formatUsPhoneInput, formatUsPhoneStored, isValidUsPhone } from "@/lib/usPhone";

type Me = {
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  has_agent_record?: boolean;
};

export default function ProfileSettingsForm() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [savedFullName, setSavedFullName] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [savedEmail, setSavedEmail] = useState("");

  const isDirty = fullName !== savedFullName || phone !== savedPhone || email !== savedEmail;

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: sessionData } = await supabaseBrowser().auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/me", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as Me & { error?: string };
      if (!res.ok) { setError(json.error ?? t("profile.loadFailed")); return; }
      setMe(json);
      const fn = (json.full_name ?? "").trim();
      const ph = formatUsPhoneInput((json.phone ?? "").trim());
      const em = (json.email ?? "").trim();
      setFullName(fn); setPhone(ph); setEmail(em);
      setSavedFullName(fn); setSavedPhone(ph); setSavedEmail(em);
    } catch { setError(t("profile.loadFailed")); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(null);
    const phoneTrim = phone.trim();
    if (phoneTrim && !isValidUsPhone(phone)) { setError(t("profile.phoneInvalid")); setSaving(false); return; }
    const phonePayload = phoneTrim ? formatUsPhoneStored(phone) ?? "" : "";
    if (!email.trim()) { setError(t("profile.emailRequired")); setSaving(false); return; }
    try {
      const { data: sessionData } = await supabaseBrowser().auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/me/profile", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ full_name: fullName, phone: phonePayload, email: email.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setError(json.error ?? t("profile.saveFailed")); return; }
      await supabaseBrowser().auth.refreshSession();
      setSuccess(t("profile.savedShort")); await load(); router.refresh();
    } catch { setError(t("profile.saveFailed")); } finally { setSaving(false); }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setUploading(true); setError(null); setSuccess(null);
    try {
      const supabase = supabaseBrowser();
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (!refreshed.session) { setError(t("profile.signInAgain")); return; }
      const result = await uploadProfilePhotoWithSessionClient(supabase, file);
      if (result.ok === false) { setError(result.error); return; }
      setMe((m) => ({ ...m, avatar_url: result.publicUrl }));
      setSuccess(t("profile.photoUpdated")); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : t("profile.uploadFailed")); } finally { setUploading(false); }
  }

  if (loading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">{t("profile.loading")}</div>;

  const avatarSrc = me?.avatar_url?.trim() || null;
  const initial = (me?.email?.trim()?.[0] || "?").toUpperCase();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
      {/* Photo + Role row */}
      <div className="flex items-center gap-4 p-5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
          {avatarSrc ? (
            <img src={avatarSrc} alt={t("profile.profileAlt")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-blue-800">{initial}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{me?.full_name || me?.email || t("profile.agent")}</p>
          <p className="text-xs text-gray-500">{t(`roles.${(me?.role ?? "user").toLowerCase()}`, { defaultValue: formatUserRoleLabel(me?.role) })}</p>
        </div>
        <label className="shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          {uploading ? t("profile.uploading") : t("profile.changePhoto")}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(ev) => void onPickPhoto(ev)} disabled={uploading} />
        </label>
      </div>

      {/* Contact form */}
      <form onSubmit={saveProfile} className="p-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="profilesettingsform-3" className="block text-[11px] font-medium text-gray-500 mb-1">{t("profile.fullName")}</label>
            <input id="profilesettingsform-3" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="profilesettingsform-1" className="block text-[11px] font-medium text-gray-500 mb-1">{t("profile.phone")}</label>
            <input id="profilesettingsform-1" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} autoComplete="tel" placeholder="(555) 555-5555"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label htmlFor="profilesettingsform-2" className="block text-[11px] font-medium text-gray-500 mb-1">{t("profile.email")}</label>
          <input id="profilesettingsform-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-emerald-700">{success}</p>}

        <button type="submit" disabled={saving || !isDirty}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
          {saving ? t("profile.saving") : t("profile.saveChanges")}
        </button>
      </form>
    </div>
  );
}

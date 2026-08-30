"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/ui/Toggle";

/**
 * Where an agent actually creates their marketing hub.
 *
 * Until this existed the whole feature was database-only: a hub could be built
 * but not by the person who owns it. That is the same failure the journey API
 * had before #1439 — shipped, correct, and unreachable.
 *
 * Two saves, deliberately separate. The profile is the agent's own words and
 * is theirs to change freely; the tracking ids are a different concern with a
 * different gate, and mixing them would mean a typo in a Pixel id blocks
 * someone from fixing their bio.
 */

type Profile = {
  username: string | null;
  bio: string | null;
  specialties: string[];
  published: boolean;
  postedItems: number;
  willBeIndexed: boolean;
};

type Tracking = {
  metaPixelId: string | null;
  gaMeasurementId: string | null;
  pixelActive: boolean;
};

export default function HubSettingsClient() {
  const { t } = useTranslation("dashboard");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [pixel, setPixel] = useState("");
  const [ga, setGa] = useState("");

  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved">("idle");
  const [trackingState, setTrackingState] = useState<"idle" | "saving" | "saved">("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/dashboard/hub/profile").then((r) => r.json()),
      fetch("/api/dashboard/hub/tracking").then((r) => r.json()),
    ])
      .then(([p, tr]) => {
        if (cancelled) return;
        if (!p?.ok || !tr?.ok) return setLoadError(true);
        setProfile(p as Profile);
        setTracking(tr as Tracking);
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setSpecialties((p.specialties ?? []).join(", "));
        setPixel(tr.metaPixelId ?? "");
        setGa(tr.gaMeasurementId ?? "");
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(overrides: Partial<{ published: boolean }> = {}) {
    setFieldError(null);
    setProfileState("saving");
    try {
      const res = await fetch("/api/dashboard/hub/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || undefined,
          bio,
          specialties: specialties
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ...overrides,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setProfileState("idle");
        // The server answers in sentences — "That username is taken" — so show
        // what it said rather than inventing a generic message.
        setFieldError(json?.error ?? t("pages.hubSettings.saveFailed"));
        return;
      }
      setProfile(json as Profile);
      setProfileState("saved");
    } catch {
      setProfileState("idle");
      setFieldError(t("pages.hubSettings.saveFailed"));
    }
  }

  async function saveTracking() {
    setTrackingState("saving");
    try {
      const res = await fetch("/api/dashboard/hub/tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metaPixelId: pixel, gaMeasurementId: ga }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setTrackingState("idle");
        setFieldError(t("pages.hubSettings.saveFailed"));
        return;
      }
      setTracking((prev) =>
        prev ? { ...prev, metaPixelId: pixel || null, gaMeasurementId: ga || null, pixelActive: json.pixelActive } : prev,
      );
      setTrackingState("saved");
    } catch {
      setTrackingState("idle");
      setFieldError(t("pages.hubSettings.saveFailed"));
    }
  }

  if (loadError) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {t("pages.hubSettings.loadFailed")}
      </p>
    );
  }
  if (!profile || !tracking) {
    return <p className="text-sm text-gray-400">···</p>;
  }

  const field =
    "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";
  const hint = "mt-1 text-xs text-gray-500";
  const labelCls = "block text-sm font-medium text-gray-700";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("pages.hubSettings.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{t("pages.hubSettings.blurb")}</p>
      </div>

      {fieldError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {fieldError}
        </p>
      ) : null}

      {/* ── Live switch. Green on / gray off, right next to its label. ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <Toggle
            checked={profile.published}
            onChange={(next) => void saveProfile({ published: next })}
            label={t("pages.hubSettings.publishLabel")}
          />
          <span className="text-sm font-medium text-gray-900">
            {t("pages.hubSettings.publishLabel")}
          </span>
          {profile.published && profile.username ? (
            <Link
              href={`/@${profile.username}`}
              className="ml-auto text-sm font-medium text-blue-700 hover:underline"
            >
              {t("pages.hubSettings.viewHub")}
            </Link>
          ) : null}
        </div>
        <p className={hint}>
          {profile.published
            ? t("pages.hubSettings.publishHintOn")
            : t("pages.hubSettings.publishHintOff")}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          {t("pages.hubSettings.postedItems", { count: profile.postedItems })}
          {" · "}
          {profile.willBeIndexed
            ? t("pages.hubSettings.indexedYes")
            : t("pages.hubSettings.indexedNo")}
        </p>
      </div>

      {/* ── Identity and words ── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <label className={labelCls}>
          {t("pages.hubSettings.usernameLabel")}
          <div className="mt-1 flex items-center gap-1">
            <span className="text-gray-400">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`${field} mt-0`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </label>
        <p className={hint}>{t("pages.hubSettings.usernameHint")}</p>

        <label className={labelCls}>
          {t("pages.hubSettings.bioLabel")}
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} className={field} />
        </label>
        <p className={hint}>{t("pages.hubSettings.bioHint")}</p>

        <label className={labelCls}>
          {t("pages.hubSettings.specialtiesLabel")}
          <input
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            className={field}
          />
        </label>
        <p className={hint}>{t("pages.hubSettings.specialtiesHint")}</p>

        <button
          type="button"
          onClick={() => void saveProfile()}
          disabled={profileState === "saving"}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {profileState === "saving"
            ? t("pages.hubSettings.saving")
            : profileState === "saved"
              ? t("pages.hubSettings.saved")
              : t("pages.hubSettings.save")}
        </button>
      </div>

      {/* ── The agent's own analytics ── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">
          {t("pages.hubSettings.trackingTitle")}
        </h2>

        <label className={labelCls}>
          {t("pages.hubSettings.gaLabel")}
          <input value={ga} onChange={(e) => setGa(e.target.value)} className={field} spellCheck={false} />
        </label>
        <p className={hint}>{t("pages.hubSettings.gaHint")}</p>

        <label className={labelCls}>
          {t("pages.hubSettings.pixelLabel")}
          <input value={pixel} onChange={(e) => setPixel(e.target.value)} className={field} spellCheck={false} />
        </label>
        <p className={hint}>
          {t("pages.hubSettings.pixelHint")}
          {pixel
            ? ` · ${
                tracking.pixelActive
                  ? t("pages.hubSettings.pixelActive")
                  : t("pages.hubSettings.pixelNeedsPremium")
              }`
            : ""}
        </p>
        <p className={hint}>{t("pages.hubSettings.privacyNote")}</p>

        <button
          type="button"
          onClick={() => void saveTracking()}
          disabled={trackingState === "saving"}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {trackingState === "saving"
            ? t("pages.hubSettings.saving")
            : trackingState === "saved"
              ? t("pages.hubSettings.saved")
              : t("pages.hubSettings.save")}
        </button>
      </div>
    </div>
  );
}

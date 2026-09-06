"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * TikTok posting options — the consent step TikTok's Content Posting API
 * requires, and the reason this app failed its first audit.
 *
 * The rules this screen exists to satisfy:
 *
 *  - The account holder chooses the audience. The app may not choose, and may
 *    not default to public. So there is no preselected privacy level: until
 *    someone picks one, automated posts refuse to run and say why.
 *  - Account-level interaction settings win. If the creator has comments off on
 *    TikTok, that box is checked and disabled here, and the server ORs it in
 *    regardless of what the browser sends.
 *  - Commercial content must be declared, and branded content may not be
 *    posted privately.
 *  - The creator has to see the declaration, with the actual policy links.
 *
 * Everything here is per connected account and applies to every automated post,
 * because CloseBoss publishes from a cron with nobody present to answer a
 * dialog.
 */

type PrivacyLevel = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";

const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends (mutual follows)",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me (private)",
};

type CreatorInfo = {
  nickname: string | null;
  username: string | null;
  privacyLevelOptions: PrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

type Prefs = {
  privacyLevel: string | null;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  confirmedAt: string | null;
  nickname: string | null;
};

export default function TikTokPostOptionsPanel() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<CreatorInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leads-gen/connect/tiktok/post-options");
      const b = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        connected?: boolean;
        prefs?: Prefs;
        creatorInfo?: CreatorInfo | null;
        creatorInfoError?: string | null;
      };
      if (!b.ok) return;
      setConnected(Boolean(b.connected));
      setInfo(b.creatorInfo ?? null);
      setInfoError(b.creatorInfoError ?? null);
      setPrefs(
        b.prefs ?? {
          privacyLevel: null,
          disableComment: false,
          disableDuet: false,
          disableStitch: false,
          brandOrganic: false,
          brandContent: false,
          confirmedAt: null,
          nickname: null,
        },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(next: Partial<Prefs>) {
    setPrefs((cur) => (cur ? { ...cur, ...next } : cur));
    setNote(null);
    setError(null);
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/leads-gen/connect/tiktok/post-options", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; prefs?: Prefs; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? "Could not save that.");
        return;
      }
      if (b.prefs) setPrefs(b.prefs);
      setNote("Saved. Automated TikTok posts will use these choices.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-4 text-sm text-slate-500">Loading TikTok options…</div>;

  if (!connected) {
    return (
      <p className="text-xs text-slate-600">
        Connect a TikTok account first, then choose how it should post.
      </p>
    );
  }

  const options = info?.privacyLevelOptions ?? [];
  const unconfirmed = !prefs?.privacyLevel || !prefs?.confirmedAt;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        TikTok requires the account holder to choose the audience and declare commercial content.
        These choices apply to every post CloseBoss publishes for you.
      </p>

      {unconfirmed ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Nothing is posting to TikTok yet. Choose an audience below and save — until then,
          scheduled TikTok posts are skipped rather than sent to a default you did not pick.
        </p>
      ) : null}

      {infoError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {infoError}
        </p>
      ) : null}

      {info ? (
        <p className="text-[11px] text-slate-500">
          Posting as {info.nickname || info.username || "your TikTok account"}
          {info.maxVideoPostDurationSec
            ? ` · videos up to ${Math.floor(info.maxVideoPostDurationSec / 60)}m${info.maxVideoPostDurationSec % 60}s`
            : ""}
        </p>
      ) : null}

      <fieldset>
        <legend className="text-[11px] font-medium text-slate-500">Who can see these posts</legend>
        <div className="mt-1 space-y-1.5">
          {options.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              TikTok did not return any audience options for this account.
            </p>
          ) : null}
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="tiktok-privacy"
                checked={prefs?.privacyLevel === opt}
                onChange={() => patch({ privacyLevel: opt })}
                className="accent-brand-accent"
              />
              {PRIVACY_LABELS[opt] ?? opt}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[11px] font-medium text-slate-500">Interactions</legend>
        <div className="mt-1 space-y-1.5">
          {(
            [
              ["disableComment", "Turn off comments", info?.commentDisabled],
              ["disableDuet", "Turn off Duet", info?.duetDisabled],
              ["disableStitch", "Turn off Stitch", info?.stitchDisabled],
            ] as const
          ).map(([key, label, lockedOff]) => (
            <label
              key={key}
              className={`flex items-center gap-2 text-sm ${lockedOff ? "text-slate-400" : "text-slate-800"}`}
            >
              <input
                type="checkbox"
                checked={lockedOff ? true : Boolean(prefs?.[key])}
                disabled={Boolean(lockedOff)}
                onChange={(e) => patch({ [key]: e.target.checked } as Partial<Prefs>)}
                className="accent-brand-accent"
              />
              {label}
              {lockedOff ? (
                <span className="text-[10px] text-slate-400">already off in your TikTok settings</span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[11px] font-medium text-slate-500">Commercial content</legend>
        <div className="mt-1 space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={Boolean(prefs?.brandOrganic)}
              onChange={(e) => patch({ brandOrganic: e.target.checked })}
              className="accent-brand-accent"
            />
            Promoting my own business
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={Boolean(prefs?.brandContent)}
              onChange={(e) => patch({ brandContent: e.target.checked })}
              className="accent-brand-accent"
            />
            Paid partnership with a brand
          </label>
          {prefs?.brandContent && prefs?.privacyLevel === "SELF_ONLY" ? (
            <p className="text-[11px] text-amber-700">
              TikTok does not allow branded content on a private post. Choose a different audience,
              or turn this off.
            </p>
          ) : null}
        </div>
      </fieldset>

      <p className="text-[11px] leading-relaxed text-slate-500">
        By posting, you agree to TikTok&apos;s{" "}
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          Music Usage Confirmation
        </a>
        {prefs?.brandContent ? (
          <>
            {" "}and{" "}
            <a
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Branded Content Policy
            </a>
          </>
        ) : null}
        .
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !prefs?.privacyLevel}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save TikTok options"}
        </button>
        {note ? <span className="text-sm text-green-700">{note}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}

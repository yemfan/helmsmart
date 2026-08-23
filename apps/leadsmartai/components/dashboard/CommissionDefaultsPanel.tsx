"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Preferences = {
  commissionBuyerPct: number;
  commissionListingPct: number;
  brokerageSplitPct: number;
  referralFeePct: number;
};

/**
 * Inline settings for commission defaults used by the Performance
 * dashboard + auto-applied on transaction close. On-blur save — each
 * input persists when the agent tabs out, so they don't have to hit
 * "Save." Values clamp to sane ranges server-side.
 */
export function CommissionDefaultsPanel() {
  const { t } = useTranslation("dashboard");
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/settings/commission-prefs");
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          preferences?: Preferences;
          error?: string;
        };
        if (body.ok && body.preferences) setPrefs(body.preferences);
        else setMsg({ tone: "err", text: body.error ?? "Failed to load preferences." });
      } catch (e) {
        setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
      }
    })();
  }, []);

  async function save(patch: Partial<Preferences>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dashboard/settings/commission-prefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save." });
        return;
      }
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) return <div className="text-xs text-slate-500">{t("pages.commissionDefaults.loadingPreferences")}</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t("pages.commissionDefaults.intro")}</p>

      <div className="grid grid-cols-2 gap-3">
        <PctInput
          label={t("pages.commissionDefaults.buyerSide")}
          value={prefs.commissionBuyerPct}
          onBlur={(v) => void save({ commissionBuyerPct: v })}
          disabled={saving}
          max={15}
          hint="Typical buyer-side commission is 2.5–3.0%, negotiated as offer of cooperation."
        />
        <PctInput
          label={t("pages.commissionDefaults.listingSide")}
          value={prefs.commissionListingPct}
          onBlur={(v) => void save({ commissionListingPct: v })}
          disabled={saving}
          max={15}
          hint="Typical listing commission is 2.5–3.0%."
        />
        <PctInput
          label={t("pages.commissionDefaults.brokerageSplit")}
          value={prefs.brokerageSplitPct}
          onBlur={(v) => void save({ brokerageSplitPct: v })}
          disabled={saving}
          max={100}
          hint="70 = 70/30 favoring you. 100 if solo on your own license."
        />
        <PctInput
          label={t("pages.commissionDefaults.referralFee")}
          value={prefs.referralFeePct}
          onBlur={(v) => void save({ referralFeePct: v })}
          disabled={saving}
          max={100}
          hint="Usually 0. Set if you owe a fixed referrer. Applied off the TOP before split."
        />
      </div>

      {msg ? (
        <p className={`text-xs ${msg.tone === "ok" ? "text-green-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

function PctInput({
  label,
  value,
  onBlur,
  disabled,
  max,
  hint,
}: {
  label: string;
  value: number;
  onBlur: (v: number) => void;
  disabled?: boolean;
  max: number;
  hint?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          min={0}
          max={max}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft);
            if (!Number.isFinite(n)) {
              setDraft(String(value));
              return;
            }
            if (n === value) return;
            onBlur(Math.max(0, Math.min(max, n)));
          }}
          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-50"
        />
        <span className="text-sm text-slate-500">%</span>
      </div>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

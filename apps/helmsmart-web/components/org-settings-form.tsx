"use client";

import { useActionState, useEffect, useState } from "react";
import { updateOrg } from "@/lib/actions/settings";
import type { SettingsState } from "@/lib/actions/settings";

interface Props {
  org: {
    name: string;
    entity_type: string;
    timezone: string;
  } | null;
  timezones: string[];
  weeklyDigestEnabled?: boolean;
  ownerEnglishAssist?: boolean;
}

export function OrgSettingsForm({ org, timezones, weeklyDigestEnabled, ownerEnglishAssist }: Props) {
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    updateOrg,
    null
  );

  /*
    The result belongs on the button, not above it.

    This form used to render a green "Settings saved." panel between the last
    field and the button. Every other save control in the app — voice settings,
    reception settings, billing rates, appointment reminders — reports the
    result in the button label and clears after a moment. The panel was this
    one screen's own convention, and because it appeared only after a save it
    inserted a line of layout and pushed the button the owner had just clicked
    further down the page.
  */
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!state?.success) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Business name</label>
        <input
          name="name"
          type="text"
          required
          disabled={isPending}
          defaultValue={org?.name ?? ""}
          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
        />
      </div>

      {/*
        Timezone stays: it decides when business hours open, when reminders
        fire, and how a caller's "tomorrow" is read. Fiscal year end was
        removed — nothing in the product ever read it, so it asked every owner
        to make a decision that changed nothing.
      */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Timezone</label>
        <select
          name="timezone"
          defaultValue={org?.timezone ?? "America/New_York"}
          disabled={isPending}
          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>{tz.replace("America/", "").replace("Pacific/", "Pacific/").replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Entity type</label>
        <input
          type="text"
          disabled
          value={org?.entity_type?.replace("_", " ").toUpperCase() ?? "—"}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-500 cursor-not-allowed"
        />
        <p className="text-[10px] text-slate-400 mt-1">Contact support to change entity type. Billing rates are under the <strong>Financial</strong> tab.</p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="weekly_digest_enabled"
            defaultChecked={weeklyDigestEnabled ?? true}
            disabled={isPending}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">Weekly digest email</span>
        </label>
        <p className="text-[10px] text-slate-400 mt-1 ml-6">
          A Monday summary of cash, receivables, bills, and tasks — emailed to owners &amp; admins.
        </p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="owner_english_assist"
            defaultChecked={ownerEnglishAssist ?? true}
            disabled={isPending}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">Show me English (multi-language assist)</span>
        </label>
        <p className="text-[10px] text-slate-400 mt-1 ml-6">
          Translate non-English customer messages to English in your inbox, and send replies &amp; reminders bilingually (their language + English) so you can read what went out.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Saving…" : saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {/*
        A refused save still has to say so — the failure is the case worth
        interrupting the layout for, and it sits below the button like every
        other error in the app.
      */}
      {state?.error && (
        <p className="text-xs text-rose-600" role="alert">{state.error}</p>
      )}
    </form>
  );
}

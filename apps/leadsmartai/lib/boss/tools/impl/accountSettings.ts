import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeAccountTimezone } from "@/lib/agent/timezone";
import { defineTool } from "../types";

/**
 * get_account_settings — what the account is currently set to.
 *
 * Written because a realtor asked Max "what is the setting of my timezone?"
 * and Max, having no tool that could see it, handed the question off and then
 * told them to open "Settings → Account / Profile → Timezone" — a path it made
 * up. The answer was close enough to sound right, which is the problem: the
 * model reaches for a plausible-looking location whenever it is asked where
 * something lives and has nothing real to go on.
 *
 * So this tool returns both halves — the VALUE from the database and the
 * LOCATION as both a label and a route this repo actually serves. The route is real
 * href, not prose: if the settings pages are reorganised again, a stale href
 * 404s visibly instead of quietly sending people to a tab that isn't there.
 * (They were reorganised, days after the timezone control shipped.)
 *
 * Read-only, and deliberately narrow: what the `agents` row itself holds.
 * Language is NOT here on purpose — there is no `agents.locale` column; the UI
 * locale lives in a cookie, which a worker with no request behind it cannot
 * read. Selecting it would have 42703'd the whole query and taken the timezone
 * down with it.
 */

const NO_ARGS = z.object({}).describe("No input.");

/** Where each setting is actually edited. Keep in step with lib/settings/groups.ts. */
const ACCOUNT_SETTINGS_HREF = "/dashboard/settings/account";
/*
 * What to CALL that place, in the words on the screen.
 *
 * The first version returned only the href, and Max duly wrote
 * "go to /dashboard/settings/account" to the realtor — a raw internal path,
 * which the prompt already forbids two rules further up. Handing back a label
 * and a link separately lets it say where in the words the nav actually uses
 * and keep the path as the destination.
 */
const ACCOUNT_SETTINGS_LABELS: Record<string, string> = {
  en: "Settings → Account",
  "zh-Hans": "设置 → 账户",
};

/**
 * Say it in the words on the realtor's own screen.
 *
 * Asked in Chinese, Max answered in Chinese and then quoted the English
 * "Settings → Account", because this label was a single hard-coded string —
 * while the sidebar beside it read 设置 and 账户. The model translates its own
 * prose; it will not second-guess a literal it was handed, and it should not
 * have to.
 */
export function accountSettingsLabel(locale: string | null | undefined): string {
  const key = (locale ?? "en").toLowerCase();
  if (key.startsWith("zh")) return ACCOUNT_SETTINGS_LABELS["zh-Hans"];
  return ACCOUNT_SETTINGS_LABELS.en;
}

export const getAccountSettings = defineTool({
  name: "get_account_settings",
  description:
    "Read the realtor's own account preferences: their timezone and the times their morning and evening briefings are sent. Use for 'what is my timezone', 'what timezone am I set to', 'when do my briefings arrive', and any question about how their account is currently configured. Returns where those settings are changed — quote that location rather than describing a menu path from memory. [Owned by Emma, the Receptionist.]",
  inputSchema: NO_ARGS,
  riskClass: "research",
  assignee: "receptionist",
  execute: async (ctx) => {
    const label = accountSettingsLabel(ctx.locale);
    const { data, error } = await supabaseAdmin
      .from("agents")
      .select("timezone, briefing_morning_time, briefing_evening_time")
      .eq("id", ctx.agentId)
      .maybeSingle();
    if (error) return { status: "failed", error: error.message };

    const row = (data ?? null) as {
      timezone?: string | null;
      briefing_morning_time?: string | null;
      briefing_evening_time?: string | null;
    } | null;
    if (!row) return { status: "failed", error: "Account not found." };

    // The same resolver every other consumer uses, so Max reports the zone the
    // receptionist will actually book in — not a raw column that could be
    // blank and read as "unset" when the system has a real answer.
    const timezone = safeAccountTimezone(row.timezone);
    const morning = row.briefing_morning_time ?? "07:00";
    const evening = row.briefing_evening_time ?? "18:00";
    const localTime = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    return {
      status: "completed",
      summary:
        `Timezone: ${timezone} (it is ${localTime} there now). ` +
        `Briefings: ${morning} and ${evening} in that zone. ` +
        `Both are changed under ${label} — write it as the markdown link [${label}](${ACCOUNT_SETTINGS_HREF}), with no domain in front of the path.`,
      display: {
        key: "reads.accountSettings",
        params: { timezone, localTime, morning, evening },
      },
      data: {
        timezone,
        localTimeNow: localTime,
        briefingMorningTime: morning,
        briefingEveningTime: evening,
        whereToChange: label,
        whereToChangeLink: ACCOUNT_SETTINGS_HREF,
      },
    };
  },
});

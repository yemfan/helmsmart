import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { languageDirectiveForJson } from "@/lib/i18n/directives";
import { translatorFor } from "@/lib/i18n/server";
import { moneyFormatter } from "@/lib/books-format";
import { orgTodayFor } from "@/lib/org-timezone";

// Plain server module. Turns the dashboard's signals into a plain-English
// "what needs you today" briefing, cached once per org per day.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5";

export type BriefingSignals = {
  overdueCount: number;
  overdueAmount: number;
  unreadMessages: number;
  urgentMessages: number;
  tasksOverdue: number;
  tasksDueToday: number;
  lowestProjectedCash: number | null;
  uninvoicedAmount: number;
};

/**
 * Who the briefing is being written for: the language they read the dashboard
 * in, and the currency their ledger is kept in. The two are independent — a
 * Canadian owner reading Chinese still sees CAD.
 */
export type BriefingReader = {
  locale: string | null | undefined;
  currency: string | null | undefined;
};

export type Briefing = { headline: string; actions: string[] };

/** Deterministic briefing used when the AI is unavailable. */
function fallback(s: BriefingSignals, reader: BriefingReader): Briefing {
  const t = translatorFor(reader.locale, "home");
  const money = moneyFormatter(reader.locale, reader.currency, { maximumFractionDigits: 0 });
  const actions: string[] = [];
  if (s.overdueCount > 0) {
    actions.push(
      t("briefing.chaseOverdue", { count: s.overdueCount, amount: money(s.overdueAmount) }),
    );
  }
  if (s.urgentMessages > 0) {
    actions.push(t("briefing.replyUrgent", { count: s.urgentMessages }));
  } else if (s.unreadMessages > 0) {
    actions.push(t("briefing.unread", { count: s.unreadMessages }));
  }
  const tasks = s.tasksOverdue + s.tasksDueToday;
  if (tasks > 0) actions.push(t("briefing.tasksDue", { count: tasks }));
  return {
    headline: actions.length ? t("briefing.headline") : t("briefing.allClear"),
    actions: actions.slice(0, 3),
  };
}

/**
 * The morning briefing for one org, cached once per (org, day, LANGUAGE).
 *
 * The language belongs in the key. Without it the first read of the day froze
 * the briefing's language for everyone: an owner who switched to 简体中文 kept
 * an English paragraph sitting at the top of a fully translated dashboard
 * until the next morning — the half-translated page this whole effort exists
 * to remove, on the most-read line of the app. Two owners of one business who
 * read different languages had the same problem permanently, and for them
 * "wait until tomorrow" was never a fix at all.
 *
 * The cost is one extra generation per language actually in use, which is the
 * honest price of the feature.
 */
export async function getOrCreateDailyBriefing(
  orgId: string,
  signals: BriefingSignals,
  reader: BriefingReader,
): Promise<Briefing> {
  const s = signals;
  const db = await createServiceClient();
  // The org's own day: keyed by the UTC date, a US owner's "morning" briefing
  // was regenerated at 5 PM Pacific and dated tomorrow.
  const today = await orgTodayFor(db, orgId);
  const money = moneyFormatter(reader.locale, reader.currency, { maximumFractionDigits: 0 });

  // Cached once per org per day per language.
  const { data: existing } = await db
    .from("daily_briefings")
    .select("headline, actions")
    .eq("organization_id", orgId)
    .eq("briefing_date", today)
    .eq("locale", reader.locale)
    .maybeSingle();
  if (existing) {
    return { headline: existing.headline as string, actions: (existing.actions as string[]) ?? [] };
  }

  let briefing: Briefing;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      // The owner reads this, so it goes out in their language. The JSON
      // variant keeps "headline" and "actions" as the parser expects them.
      system: `You are a small-business owner's assistant writing their morning briefing.${languageDirectiveForJson(
        reader.locale,
      )}`,
      messages: [
        {
          role: "user",
          content: `Today's numbers:
- Overdue invoices: ${s.overdueCount} totaling ${money(s.overdueAmount)}
- Unread inbox messages: ${s.unreadMessages} (${s.urgentMessages} marked urgent)
- Tasks: ${s.tasksOverdue} overdue, ${s.tasksDueToday} due today
- Uninvoiced billable time: ${money(s.uninvoicedAmount)}${
            s.lowestProjectedCash !== null && s.lowestProjectedCash < 0
              ? `\n- WARNING: projected cash dips to ${money(s.lowestProjectedCash)} within 90 days`
              : ""
          }

Return ONLY a JSON object: {"headline":"one warm, specific sentence","actions":["up to 3 prioritized, specific items, most urgent first, with the numbers — e.g. 'Chase ${money(
            1200,
          )} across 2 overdue invoices'"]}.
Only include actions that genuinely need the owner today. If nothing is pressing, the headline says they're caught up and actions is [].`,
        },
      ],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = m ? (JSON.parse(m[0]) as { headline?: unknown; actions?: unknown }) : null;
    briefing =
      parsed && typeof parsed.headline === "string"
        ? {
            headline: parsed.headline,
            actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3).map(String) : [],
          }
        : fallback(s, reader);
  } catch {
    briefing = fallback(s, reader);
  }

  await db.from("daily_briefings").upsert(
    {
      organization_id: orgId,
      briefing_date: today,
      locale: reader.locale,
      headline: briefing.headline,
      actions: briefing.actions,
    },
    { onConflict: "organization_id,briefing_date,locale" }
  );
  return briefing;
}

/**
 * Localized view of the /demo fixtures.
 *
 * The demo workspace was half-translated: its chrome, headings and column
 * labels all went through `t()`, and everything those labels pointed AT —
 * the briefings, the task list, the calendar, the 50-row activity column —
 * came straight out of `data.ts` in English. Switching to 中文 produced a
 * Chinese frame around an English workspace, which reads worse than either
 * language alone, and a field tester reasonably read it as "the language
 * toggle does nothing on /demo".
 *
 * WHERE THE ENGLISH LIVES. `pages.demoContent` in both locale bundles —
 * en/zh key parity is enforced (navLabels.test.ts), so shipping only the
 * Chinese side isn't an option. The English half is DERIVED from `data.ts`
 * rather than retyped, so the fixture stays the one place an English string
 * is authored. Each lookup below also passes the fixture's own value as
 * `defaultValue`, which keeps a dropped key rendering English copy instead of
 * a raw `pages.demoContent.…` on the screen.
 *
 * WHAT IS NOT TRANSLATED. The message bodies inside a conversation, and the
 * draft text the AI composed. Those are simulated messages between an agent
 * and their client — the language of a text belongs to whoever wrote it, not
 * to the UI chrome around it, the same call already made for the voice
 * system prompt. Everything the *product* says about them (the preview line,
 * the AI's reasoning, the activity summary) is translated, because that is
 * the app talking to the reader.
 */
import type {
  DemoBriefing,
  DemoCalendarEvent,
  DemoContact,
  DemoConversation,
  DemoDeal,
  DemoDraft,
  DemoTask,
} from "@/lib/demo/data";

/**
 * The shape both `getServerT()` and `useTranslation().t` satisfy. Typed
 * loosely on purpose — i18next's own `TFunction` overloads don't narrow
 * usefully through a wrapper like this one.
 */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

const NS = "dashboard";

/** `t()` against the demo-content subtree, falling back to the fixture. */
function copy(t: Translate, key: string, english: string): string {
  return t(`pages.demoContent.${key}`, { ns: NS, defaultValue: english });
}

/** Same, but preserves `undefined` for the optional fixture fields. */
function optionalCopy(
  t: Translate,
  key: string,
  english: string | undefined,
): string | undefined {
  return english == null ? undefined : copy(t, key, english);
}

export function localizeBriefing(t: Translate, b: DemoBriefing): DemoBriefing {
  return {
    ...b,
    title: copy(t, `briefings.${b.id}.title`, b.title),
    body: copy(t, `briefings.${b.id}.body`, b.body),
    actionLabel: copy(t, `briefings.${b.id}.actionLabel`, b.actionLabel),
  };
}

export function localizeTask(t: Translate, task: DemoTask): DemoTask {
  return {
    ...task,
    title: copy(t, `tasks.${task.id}.title`, task.title),
    dueLabel: copy(t, `tasks.${task.id}.dueLabel`, task.dueLabel),
  };
}

export function localizeEvent(
  t: Translate,
  e: DemoCalendarEvent,
): DemoCalendarEvent {
  return {
    ...e,
    title: copy(t, `events.${e.id}.title`, e.title),
    when: copy(t, `events.${e.id}.when`, e.when),
  };
}

export function localizeContact(t: Translate, c: DemoContact): DemoContact {
  return {
    ...c,
    lastActivity: copy(t, `contacts.${c.id}.lastActivity`, c.lastActivity),
    interest: optionalCopy(t, `contacts.${c.id}.interest`, c.interest),
    tag: optionalCopy(t, `contacts.${c.id}.tag`, c.tag),
  };
}

export function localizeDeal(t: Translate, d: DemoDeal): DemoDeal {
  return {
    ...d,
    // `stage` is a closed set, so it keys off the value rather than the row.
    stage: copy(t, `dealStages.${slug(d.stage)}`, d.stage) as DemoDeal["stage"],
    nextMilestone: copy(t, `deals.${d.id}.nextMilestone`, d.nextMilestone),
  };
}

export function localizeDraft(t: Translate, d: DemoDraft): DemoDraft {
  // `draft` is the message itself — see the note at the top of this file.
  return { ...d, reasoning: copy(t, `drafts.${d.id}.reasoning`, d.reasoning) };
}

export function localizeConversation(
  t: Translate,
  c: DemoConversation,
): DemoConversation {
  return {
    ...c,
    preview: copy(t, `conversations.${c.id}.preview`, c.preview),
    messages: c.messages.map((m) => ({
      ...m,
      // The sender label is ours; "AI" reads the same in both languages, and
      // the contact's own name is a proper noun. Only "You" needs a word.
      fromLabel:
        m.fromLabel === "You"
          ? copy(t, "senders.you", m.fromLabel)
          : m.fromLabel,
    })),
  };
}

/**
 * Lead source. Only the category-style sources (Open House, Referral, IDX
 * website, Past client) have keys — the portal names (Zillow, Realtor.com,
 * Facebook, Google LSA) are proper nouns, so they deliberately have none and
 * fall through to the fixture value. A key whose Chinese equals its English
 * is indistinguishable from a forgotten translation, which is exactly what
 * the locale-parity check flags.
 */
export function localizeSource(t: Translate, source: string): string {
  // Slugged, because i18next reads "." as a nesting separator and the raw
  // value "Realtor.com" would look up sources → Realtor → com.
  return copy(t, `sources.${slug(source)}`, source);
}

/** "Clear to close" → "clear_to_close", so a value can be a translation key. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

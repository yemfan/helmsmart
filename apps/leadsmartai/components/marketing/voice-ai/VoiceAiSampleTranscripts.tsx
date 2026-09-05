import { getServerT } from "@/lib/i18n/server";
import { resolveVoiceDemoPhone } from "@/lib/marketing/voiceDemoPhone";

type Turn = {
  speaker: "ai" | "caller";
  text: string;
};

type Scenario = {
  id: string;
  title: string;
  blurb: string;
  /** Outcome line — what the agent's CRM looks like after the call. */
  outcome: string;
  turns: Turn[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "buyer-after-hours",
    title: "Buyer · after-hours inquiry on a listing",
    blurb:
      "A consumer hits the listing detail page at 9:47 PM, taps Schedule a tour, and the AI calls them back in 12 seconds.",
    outcome:
      "Lead created · price range + bed minimums captured · tour booked for Saturday 11 AM · agent texted summary.",
    turns: [
      { speaker: "ai", text: "Hi Sarah, this is Riley from Greenfield Realty calling about 1234 Elm Street. Got a minute?" },
      { speaker: "caller", text: "Yeah, hi — yes, I just looked at it online." },
      { speaker: "ai", text: "Awesome. Just to make sure I send you the right info: are you looking for a primary home, or an investment?" },
      { speaker: "caller", text: "Primary, for our family." },
      { speaker: "ai", text: "Got it. And ballpark — are you pre-approved, or still working on financing?" },
      { speaker: "caller", text: "We're pre-approved up to about 1.1." },
      { speaker: "ai", text: "Perfect, this one is well within that. The earliest I have on the schedule is Saturday at 11 AM with our agent Alex — does that work?" },
      { speaker: "caller", text: "Saturday at 11 works." },
      { speaker: "ai", text: "Booked. You'll get a calendar invite and a text confirmation in a moment. Anything you want me to flag for Alex before the showing?" },
    ],
  },
  {
    id: "seller-warm-pastclient",
    title: "Past client · seller equity check",
    blurb:
      "A 2018 closing rolls past its 7-year anniversary; the AI follows up on the daily SOI digest the agent dispatched.",
    outcome:
      "Listing-consultation appointment booked · home-value report queued for delivery · marked Hot in CRM.",
    turns: [
      { speaker: "ai", text: "Hi Mike, it's Riley from Greenfield Realty — just a quick check-in. Have a minute?" },
      { speaker: "caller", text: "Sure, what's up?" },
      { speaker: "ai", text: "Your place on Maple Court hit its seven-year mark, and homes like yours are trading about 40% above what you paid. Are you thinking about your next move at all?" },
      { speaker: "caller", text: "Honestly… we've been talking about it. Maybe in the spring." },
      { speaker: "ai", text: "Totally get it. Want me to send you a quick equity report so you have real numbers when you decide? And I can have Alex spend 20 minutes walking through what the spring market looks like. No pressure." },
      { speaker: "caller", text: "Yeah, that'd actually be great." },
      { speaker: "ai", text: "Done. The equity report will hit your inbox tonight. How's Wednesday at 6 for a 20-min call with Alex?" },
    ],
  },
  {
    id: "objection-handling",
    title: "Objection handling · skeptical caller",
    blurb:
      "A test caller pushes back hard. The AI does not pressure, does not invent claims, and routes to a human cleanly.",
    outcome:
      "Lead created with intent='skeptical' · marked Cold · no automated follow-up scheduled · human callback queued.",
    turns: [
      { speaker: "caller", text: "Wait — am I talking to a robot right now?" },
      { speaker: "ai", text: "Yes — I'm an AI assistant Alex uses to make sure no caller waits more than a minute. Happy to hand you to Alex directly if you'd prefer." },
      { speaker: "caller", text: "Honestly yeah. I'm not crazy about giving info to a bot." },
      { speaker: "ai", text: "Totally fair. I'll text Alex right now to call you back — what's the best number for them to use?" },
      { speaker: "caller", text: "This one." },
      { speaker: "ai", text: "Perfect. Alex will be in touch shortly. Have a good one." },
    ],
  },
];

/**
 * Three sample call transcripts that demonstrate the AI's range:
 *   1. Conventional after-hours buyer flow → tour booking
 *   2. SOI warm follow-up → equity story → consultation
 *   3. Objection handling → graceful human hand-off
 *
 * The third matters most. A common failure mode of voice ISAs is that they
 * dig in when challenged — that's the single biggest reason agents kill
 * pilots. Showing a clean hand-off here is the credibility move.
 */
export default async function VoiceAiSampleTranscripts() {
  const t = await getServerT();
  // "Calling the live number above runs the same engine" is only true when
  // there IS a number above. Without one the hero shows a Book-a-demo button,
  // and this line was pointing at something that was not on the page.
  const phone = resolveVoiceDemoPhone(process.env.NEXT_PUBLIC_VOICE_DEMO_PHONE);
  const hasPhone = Boolean(phone.display && phone.telHref);
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{t("pages.voiceTranscripts.title", { ns: "dashboard" })}</h2>
        <p className="mt-1 text-sm text-slate-600">{t(hasPhone ? "pages.voiceTranscripts.sub" : "pages.voiceTranscripts.subNoPhone", { ns: "dashboard" })}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <article
            key={s.id}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-1 text-xs text-slate-600">{s.blurb}</p>

            <ol className="mt-4 flex-1 space-y-2.5">
              {s.turns.map((t, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      t.speaker === "ai"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.speaker === "ai" ? "AI" : "You"}
                  </span>
                  <span className={t.speaker === "ai" ? "text-slate-900" : "text-slate-700"}>
                    {t.text}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-snug text-emerald-900">
              <span className="font-semibold uppercase tracking-wide">{t("pages.voiceTranscripts.outcome", { ns: "dashboard" })}</span> {s.outcome}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

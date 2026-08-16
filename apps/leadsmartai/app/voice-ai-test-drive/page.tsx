import type { Metadata } from "next";

import VoiceAiComparisonTable from "@/components/marketing/voice-ai/VoiceAiComparisonTable";
import VoiceAiDemoRequestForm from "@/components/marketing/voice-ai/VoiceAiDemoRequestForm";
import VoiceAiHero from "@/components/marketing/voice-ai/VoiceAiHero";
import VoiceAiSampleTranscripts from "@/components/marketing/voice-ai/VoiceAiSampleTranscripts";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Test-drive our voice AI for real estate | CloseBoss",
  description:
    "Hear our voice AI assistant qualify a real-estate lead live. Native voice, sub-3-second response, multi-language, books showings — included with the LeadSmart CRM.",
  openGraph: {
    title: "Test-drive our voice AI for real estate",
    description:
      "Native voice AI for real estate. Tap to call the live demo or have it call you.",
    type: "website",
  },
};

/**
 * Public marketing page for the Voice AI ISA. The thesis: don't try to claim
 * better voice AI in a feature comparison — let agents call the number and
 * decide for themselves. Composition order matters:
 *
 *   1. Hero (with the live phone number) — the experience-it part
 *   2. Sample transcripts — sets expectations before they call
 *   3. Comparison table — for evaluators who want a feature line-up
 *   4. Demo-request form — for agents who'd rather have it call them
 *
 * Server-rendered (with one client form island) so it's fast + SEO-friendly.
 * Hits the same Twilio + OpenAI Realtime engine the production CRM uses.
 */
export default async function VoiceAiTestDrivePage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
      <VoiceAiHero />

      <VoiceAiSampleTranscripts />

      <VoiceAiComparisonTable />

      <VoiceAiDemoRequestForm />

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
        <h3 className="text-base font-semibold text-slate-900">{t("pages.articleChrome.faq", { ns: "dashboard" })}</h3>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-900">Is this really an AI on the live demo number?</dt>
            <dd className="mt-1 text-slate-700">
              Yes — the demo number routes to the same Twilio + OpenAI Realtime engine
              we ship to paying agents. There&apos;s no human on the line.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Will my contacts be sent to a third-party ISA service?</dt>
            <dd className="mt-1 text-slate-700">
              No. The voice AI lives inside LeadSmart — your call recordings, transcripts,
              and contact records stay in your account, not on a separate vendor.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">How does it hand off when a caller wants a human?</dt>
            <dd className="mt-1 text-slate-700">
              The AI routes to you immediately — SMS + push notification with a one-line
              summary and the caller&apos;s number. Most agents reach the lead in under 60 seconds.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">What languages does it speak?</dt>
            <dd className="mt-1 text-slate-700">
              English, Spanish, and Mandarin are tuned. We can enable additional languages
              for brokerage tiers — ask during your demo.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

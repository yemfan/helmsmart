import type { Metadata } from "next";

import VoiceAiComparisonTable from "@/components/marketing/voice-ai/VoiceAiComparisonTable";
import VoiceAiDemoRequestForm from "@/components/marketing/voice-ai/VoiceAiDemoRequestForm";
import VoiceAiHero from "@/components/marketing/voice-ai/VoiceAiHero";
import VoiceAiSampleTranscripts from "@/components/marketing/voice-ai/VoiceAiSampleTranscripts";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.voiceAiTestDrive.title", { ns: "web_marketing" });
  const description = t("routeMeta.voiceAiTestDrive.description", { ns: "web_marketing" });
  return {
  title,
  description,
  openGraph: {
    title,
    description:
      "Native voice AI for real estate. Tap to call the live demo or have it call you.",
    type: "website",
  },
};
}

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
            <dt className="font-semibold text-slate-900">{t("pages.voiceTestDrive.q1", { ns: "dashboard" })}</dt>
            <dd className="mt-1 text-slate-700">{t("pages.voiceTestDrive.a1", { ns: "dashboard" })}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{t("pages.voiceTestDrive.q2", { ns: "dashboard" })}</dt>
            <dd className="mt-1 text-slate-700">{t("pages.voiceTestDrive.a2", { ns: "dashboard" })}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{t("pages.voiceTestDrive.q3", { ns: "dashboard" })}</dt>
            <dd className="mt-1 text-slate-700">{t("pages.voiceTestDrive.a3", { ns: "dashboard" })}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{t("pages.voiceTestDrive.q4", { ns: "dashboard" })}</dt>
            <dd className="mt-1 text-slate-700">{t("pages.voiceTestDrive.a4", { ns: "dashboard" })}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

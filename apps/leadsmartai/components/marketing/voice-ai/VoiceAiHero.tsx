import Link from "next/link";

import { resolveVoiceDemoPhone } from "@/lib/marketing/voiceDemoPhone";
import { getServerT } from "@/lib/i18n/server";

/**
 * Hero for the public Voice AI test-drive page. Surfaces the live demo
 * phone number when configured (via NEXT_PUBLIC_VOICE_DEMO_PHONE), or
 * falls back to a "book a private demo" CTA when not.
 *
 * The phone is the *whole point* of this page — agents are evaluating
 * voice AI quality and the only way to convince them is to let them call
 * a real Twilio + OpenAI Realtime endpoint and hear it themselves. So the
 * number is the dominant visual element, with the comparison table and
 * sample transcripts as supporting evidence below.
 */
export default async function VoiceAiHero() {
  const t = await getServerT();
  const phone = resolveVoiceDemoPhone(process.env.NEXT_PUBLIC_VOICE_DEMO_PHONE);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 px-6 py-14 text-white shadow-xl sm:px-12 sm:py-20">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t("pages.voiceAiHero.liveDemo", { ns: "dashboard" })}
        </span>
        <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">{t("pages.voiceHero.headline", { ns: "dashboard" })}</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-300 sm:text-lg">{t("pages.voiceHero.sub", { ns: "dashboard" })}</p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
          {phone.display && phone.telHref ? (
            <a
              href={phone.telHref}
              className="group inline-flex flex-col items-start gap-1 rounded-2xl bg-white px-6 py-4 text-slate-900 shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-400/40"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.voiceHero.tapToCall", { ns: "dashboard" })}</span>
              <span className="text-2xl font-bold tabular-nums sm:text-3xl">{phone.display}</span>
              <span className="mt-0.5 text-xs text-slate-600 group-hover:text-slate-900">
                {t("pages.voiceAiHero.liveAi", { ns: "dashboard" })}
              </span>
            </a>
          ) : (
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-4 text-base font-semibold text-slate-900 shadow-lg hover:shadow-xl"
            >
              {t("pages.voiceAiHero.bookDemo", { ns: "dashboard" })}
            </Link>
          )}

          <a
            href="#request-callback"
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-6 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/10"
          >
            {t("pages.voiceAiHero.haveItCallYou", { ns: "dashboard" })}
          </a>
        </div>

        <ul className="mt-10 grid max-w-3xl grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <li className="flex items-start gap-2">
            <Dot tone="emerald" />{t("pages.voiceHero.nativeVoice", { ns: "dashboard" })}</li>
          <li className="flex items-start gap-2">
            <Dot tone="emerald" />{t("pages.voiceHero.languages", { ns: "dashboard" })}</li>
          <li className="flex items-start gap-2">
            <Dot tone="emerald" /> {t("pages.voiceAiHero.hotLeadPush", { ns: "dashboard" })}
          </li>
        </ul>
      </div>
    </section>
  );
}

function Dot({ tone }: { tone: "emerald" }) {
  const cls = tone === "emerald" ? "bg-emerald-400" : "bg-slate-400";
  return <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

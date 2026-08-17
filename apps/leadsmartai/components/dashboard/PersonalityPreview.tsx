"use client";

import type { AiPersonality } from "@/lib/agent-ai/types";
import { useTranslation } from "react-i18next";

const EXAMPLES: Record<
  AiPersonality,
  { sms: string; email: string; call: string; greeting: string }
> = {
  friendly: {
    sms: "Hi Jamie — thanks for texting about Maple Ave. Are you hoping to tour soon, or would you like the listing link first?",
    email:
      "Hi Jamie,\n\nThanks for your note on Maple Ave. I’m happy to help — would you like a quick tour window this week, or more photos/details first?\n\nBest,\nCloseBoss",
    call:
      "Summary: Caller asked about Maple Ave; wants a showing this weekend and prefers afternoon slots. Intent: buyer listing inquiry.",
    greeting: "Happy birthday, Jamie — hope you’re having a great day. Thinking of you and here if you need anything.",
  },
  professional: {
    sms: "Thank you for your message regarding Maple Ave. Please confirm whether you would like to schedule a showing or receive the listing details.",
    email:
      "Hello Jamie,\n\nThank you for your inquiry regarding Maple Ave. Please let me know whether you would prefer to schedule a showing or receive additional property details.\n\nRegards,\nCloseBoss",
    call:
      "Summary: Caller inquired about Maple Ave; requested weekend availability for a showing. Intent: buyer listing inquiry.",
    greeting:
      "Wishing you a happy birthday, Jamie. Please reach out anytime if we can assist with your real estate needs.",
  },
  luxury: {
    sms: "Good afternoon — thank you for your interest in Maple Ave. May I arrange a private viewing at your convenience?",
    email:
      "Dear Jamie,\n\nThank you for your thoughtful note on Maple Ave. Whenever you are ready, I would be pleased to coordinate a private viewing or share curated details at your discretion.\n\nWarm regards,\nCloseBoss",
    call:
      "Summary: Caller expressed interest in Maple Ave; seeking a discreet weekend viewing. Intent: buyer listing inquiry.",
    greeting:
      "Warm wishes on your birthday, Jamie — a quiet note to say we’re here whenever the moment is right.",
  },
};

export function PersonalityPreview({ personality }: { personality: AiPersonality }) {
  const { t } = useTranslation("dashboard");
  const ex = EXAMPLES[personality] ?? EXAMPLES.friendly;
  return (
    <div className="mt-4 grid gap-3 text-xs text-gray-700">
      <div>
        <div className="font-semibold text-gray-600 mb-1">{t("pages.personalityPreview.sms")}</div>
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 font-sans text-[11px] leading-relaxed">
          {ex.sms}
        </pre>
      </div>
      <div>
        <div className="font-semibold text-gray-600 mb-1">{t("pages.personalityPreview.email")}</div>
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 font-sans text-[11px] leading-relaxed">
          {ex.email}
        </pre>
      </div>
      <div>
        <div className="font-semibold text-gray-600 mb-1">{t("pages.personalityPreview.callSummary")}</div>
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 font-sans text-[11px] leading-relaxed">
          {ex.call}
        </pre>
      </div>
      <div>
        <div className="font-semibold text-gray-600 mb-1">{t("pages.personalityPreview.greeting")}</div>
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 font-sans text-[11px] leading-relaxed">
          {ex.greeting}
        </pre>
      </div>
      <p className="text-[10px] text-gray-500">{t("pages.personalityPreview.toneOnly")}</p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import SmsOptInForm from "./SmsOptInForm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Text Message Updates | CloseBoss",
    description:
      "Sign up to receive text message updates from CloseBoss and your real estate agent — property updates, showing confirmations, and follow-ups. Msg & data rates may apply.",
    path: "/sms",
  }),
  // Publicly indexable so carrier reviewers can reach the opt-in flow directly.
  robots: { index: true, follow: true },
};

/**
 * Public SMS opt-in page — a carrier-reviewable URL (A2P 10DLC) showing the
 * full message-flow + the unchecked-by-default consent checkbox. The program
 * disclosures are server-rendered so they're in the initial HTML for reviewers
 * and crawlers. Persists each opt-in via /api/sms/opt-in (proof of consent).
 */
export default function SmsOptInPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Get text updates from CloseBoss
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">
          Enter your number to receive text messages from CloseBoss and your
          real estate agent.
        </p>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {/* Program disclosures — server-rendered (in the HTML for reviewers). */}
        <div className="space-y-4 text-sm leading-6 text-slate-700">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              About this program
            </h2>
            <p className="mt-2">
              <strong>CloseBoss</strong> (a product of MAXY Investment Inc.)
              sends conversational and transactional text messages on behalf of
              your real estate agent: replies to your inquiry, showing and
              appointment confirmations, listing and home-search updates, and
              follow-ups.
            </p>
          </div>
          <ul className="space-y-2">
            <li>
              <strong>Message frequency</strong> varies based on your
              interaction with your agent.
            </li>
            <li>
              <strong>Message and data rates may apply</strong> (charged by your
              mobile carrier).
            </li>
            <li>
              Reply <strong>STOP</strong> to unsubscribe at any time;{" "}
              <strong>HELP</strong> for help, or email{" "}
              <a href="mailto:contact@closebossai.com" className="text-[#0072ce] hover:underline">
                contact@closebossai.com
              </a>
              .
            </li>
            <li>Consent is not a condition of any purchase.</li>
          </ul>
          <p className="text-xs text-slate-500">
            By submitting, you agree to our{" "}
            <Link href="/privacy" className="text-[#0072ce] hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-[#0072ce] hover:underline">
              Terms (incl. SMS program disclosures)
            </Link>
            . Mobile information is never shared with third parties for their own
            marketing.
          </p>
        </div>

        {/* Opt-in form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SmsOptInForm />
        </div>
      </div>
    </div>
  );
}

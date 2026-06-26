"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send } from "lucide-react";

/**
 * Public contact form on /contact.
 *
 * Doubles as the proof-of-consent surface required by Twilio's toll-free
 * verification (TFV) review. The phone field is OPTIONAL — leaving it
 * blank submits a contact request with no SMS opt-in. The SMS-consent
 * checkbox is also optional, but it's the ONLY way the user authorizes
 * receiving text messages from us; submitting without ticking it means
 * they get email follow-up only.
 *
 * The disclosure block below the checkbox includes the four elements
 * Twilio + the FCC TCPA expect to see at the point of opt-in:
 *
 *   1. WHO is sending — "RealtorBoss"
 *   2. WHAT kinds of messages — "customer care + marketing"
 *   3. FREQUENCY — "message frequency varies"
 *   4. OPT-OUT + COST — "Reply STOP to opt out, message and data rates may apply"
 *
 * Don't change the disclosure copy without updating the verification
 * record submitted to Twilio. Re-verification is required when the
 * disclosure materially changes.
 */
/**
 * Topic-aware prefill. Marketing CTAs hand us a `?topic=...` query
 * param so sales can tell at a glance which surface drove the inquiry
 * (e.g. the Team pricing card vs. a generic "Contact us" link). Add
 * cases here as new topics get linked from the marketing pages —
 * unrecognized values fall through to the empty default.
 *
 * Some topics accept additional query params for personalization:
 *   ?topic=concierge-migration&from=liondesk   → adds source CRM
 *   ?topic=integration-request&app=Calendly    → adds app name
 */
const SOURCE_CRM_LABELS: Record<string, string> = {
  liondesk: "LionDesk",
  "follow-up-boss": "Follow Up Boss",
  kvcore: "kvCORE",
  lofty: "Lofty",
  boomtown: "BoomTown",
  // Slug matches lib/marketing/switch-from.ts entry.
  "sierra-interactive": "Sierra Interactive",
};

function prefillForTopic(
  topic: string | null,
  searchParams: URLSearchParams | null,
): { subject: string; message: string } {
  switch (topic) {
    case "team":
      return {
        subject: "Team plan inquiry — more than 5 seats",
        message:
          "Hi LeadSmart team,\n\nI'm interested in the Team plan for my brokerage. We have ___ agents and would like to learn more about pricing, onboarding, and the Top Producer Track for the whole team.\n\n",
      };
    case "signature":
      return {
        subject: "Signature plan — bilingual / high-end inquiry",
        message:
          "Hi LeadSmart team,\n\nI'd like to talk through the Signature plan. My focus is ___ (bilingual EN/中文, high-end listings, etc.) and I'd like to understand what's included and how onboarding works.\n\n",
      };
    case "brokerage-working-session": {
      return {
        subject: "Brokerage working session request",
        message:
          "Hi LeadSmart team,\n\nI lead a brokerage with ___ agents and would like to schedule a working session to evaluate LeadSmart for the team. Ideal timing for me is ___.\n\nA few specifics about our setup:\n• Current CRM: ___\n• Top pain points: ___\n• Existing tech stack we'd want to integrate with: ___\n\n",
      };
    }
    case "concierge-migration": {
      const from = searchParams?.get("from") ?? "";
      const sourceCrm = SOURCE_CRM_LABELS[from] ?? "";
      const sourcePhrase = sourceCrm
        ? `I'm switching from ${sourceCrm} and`
        : "I'm switching CRMs and";
      const subject = sourceCrm
        ? `Concierge migration from ${sourceCrm}`
        : "Concierge migration request";
      return {
        subject,
        message: `Hi LeadSmart team,\n\n${sourcePhrase} would like the concierge migration service.\n\n• Approximate contact count: ___\n• Active deals to bring over: ___\n• Drip sequences I want re-implemented (just the names is fine): ___\n• Any custom fields we should preserve: ___\n• Target cutover date: ___\n\nI've read the 5-business-day guarantee on /switch-from and the Pro+ commitment requirement.\n\n`,
      };
    }
    case "integration-request": {
      const app = searchParams?.get("app")?.trim() ?? "";
      const subject = app
        ? `Integration request — ${app}`
        : "Integration request";
      return {
        subject,
        message: `Hi LeadSmart team,\n\nI'd like to request an integration${
          app ? ` with ${app}` : ""
        }.\n\n• What I'd use it for: ___\n• How critical it is (nice-to-have / blocker / would-pay-more): ___\n• How many of my contacts / deals would flow through it: ___\n${
          app ? "" : "• The app I need: ___\n"
        }\nI've seen the public integrations page at /integrations and don't see this one (or it's listed as Coming soon).\n\n`,
      };
    }
    default:
      return { subject: "", message: "" };
  }
}

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const prefill = useMemo(
    () => prefillForTopic(searchParams?.get("topic") ?? null, searchParams),
    [searchParams],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      subject: String(fd.get("subject") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
      smsConsent: fd.get("smsConsent") === "on",
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        // Surface the API's specific error when present (e.g.
        // "Please provide a phone number to receive SMS"), and fall
        // back to the generic line otherwise. Was always showing
        // "Something went wrong" before, which hid the actionable
        // detail behind validation + delivery failures alike.
        setErrorMsg(
          typeof json.error === "string" && json.error.trim()
            ? json.error
            : "Something went wrong. Please try again or email us directly.",
        );
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMsg(
        "Network error. Please try again or email us at contact@helmsmart.ai.",
      );
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <Send className="h-5 w-5 text-emerald-600" strokeWidth={2} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Message sent!</h3>
        <p className="mt-1 text-sm text-slate-600">
          Thanks for reaching out. We&apos;ll get back to you within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            placeholder="Your name"
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-phone" className="block text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
        />
      </div>

      <div>
        <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-700">
          Subject
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          required
          placeholder="How can we help?"
          defaultValue={prefill.subject}
          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          placeholder="Tell us more about your question or feedback..."
          defaultValue={prefill.message}
          className="mt-1.5 block w-full resize-y rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
        />
      </div>

      {/* SMS opt-in — Twilio TFV proof-of-consent surface. The four-element
          disclosure beneath the checkbox is required; do not edit without
          re-submitting verification. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <label htmlFor="contact-sms-consent" className="flex cursor-pointer items-start gap-3">
          <input
            id="contact-sms-consent"
            name="smsConsent"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#0072ce] focus:ring-[#0072ce]"
          />
          <span className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              Yes, send me marketing text messages from RealtorBoss.
            </span>{" "}
            By checking this box and providing my phone number above, I consent to
            receive promotional text messages from <strong>RealtorBoss</strong>{" "}
            about real-estate services, new listings, market updates, and special
            offers.
          </span>
        </label>
        <p className="mt-3 pl-7 text-xs leading-relaxed text-slate-500">
          Message frequency varies. Message and data rates may apply. Reply{" "}
          <strong>STOP</strong> to opt out at any time, or <strong>HELP</strong> for
          help. Consent is not a condition of any purchase. See our{" "}
          <a
            href="/privacy"
            className="font-medium text-[#0072ce] hover:underline"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" className="font-medium text-[#0072ce] hover:underline">
            Terms of Service
          </a>{" "}
          for details.
        </p>
      </div>

      {status === "error" && (
        <p className="text-sm font-medium text-rose-600">
          {errorMsg ??
            "Something went wrong. Please try again or email us directly."}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex items-center gap-2 rounded-xl bg-[#0072ce] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005ca8] disabled:opacity-60"
      >
        <Send className="h-4 w-4" strokeWidth={2} />
        {status === "sending" ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}

export const metadata = {
  title: "Frequently Asked Questions | HelmSmart",
  description: "Everything you need to know about HelmSmart.",
};

const faqs: { category: string; questions: { q: string; a: string }[] }[] = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "What is HelmSmart?",
        a: "HelmSmart is an AI-powered front office for small businesses. It combines a voice receptionist, unified inbox, bookkeeping, and CRM into one platform — so you can focus on running your business, not managing tools.",
      },
      {
        q: "How do I set up the voice receptionist?",
        a: "Connect your Twilio number or use Retell AI, then configure your business hours and appointment types in the Voice settings. The setup wizard walks you through each step in minutes.",
      },
      {
        q: "Do I need technical skills?",
        a: "No. Everything is configured through a simple dashboard. No coding, no complex integrations — just fill in your business details and you're live.",
      },
      {
        q: "Is there a free trial?",
        a: "Yes. You get 14 days free with full access to all features. No credit card required to start.",
      },
    ],
  },
  {
    category: "Voice Receptionist",
    questions: [
      {
        q: "What happens when the AI can't answer a question?",
        a: "If the AI doesn't have enough information to help, it offers to take a message or schedule a callback. You'll be notified immediately so you can follow up.",
      },
      {
        q: "Can it book real appointments?",
        a: "Yes. The voice receptionist syncs with your Google Calendar and only offers time slots that are genuinely available. Bookings appear on your calendar in real time.",
      },
      {
        q: "What languages does it support?",
        a: "The voice agent operates in English by default. SMS and email communications include multilingual detection to match the language your clients use.",
      },
      {
        q: "Will callers know they're talking to AI?",
        a: "Yes. The agent identifies itself as an AI assistant for your business. We believe in transparent, honest AI interactions — and it builds trust with your clients.",
      },
    ],
  },
  {
    category: "Billing & Plans",
    questions: [
      {
        q: "Can I change plans anytime?",
        a: "Yes. Upgrades take effect immediately. Downgrades take effect at the start of your next billing cycle so you never lose access mid-period.",
      },
      {
        q: "What is the $0.10/min voice charge?",
        a: "Voice calls are billed at $0.10 per minute on top of your base plan. This covers both the AI processing and telephony costs. You only pay for calls that are actually handled.",
      },
      {
        q: "Is there a contract?",
        a: "No contracts, no commitments. HelmSmart is month-to-month and you can cancel anytime from your account settings.",
      },
    ],
  },
  {
    category: "Integrations",
    questions: [
      {
        q: "Does it work with Google Calendar?",
        a: "Yes. HelmSmart connects via OAuth for a full two-way sync. The voice receptionist checks real-time availability and writes confirmed bookings directly to your calendar.",
      },
      {
        q: "What phone providers work?",
        a: "Twilio numbers work out of the box — you can bring an existing number or provision a new one. Retell AI powers the voice AI layer for natural, low-latency conversations.",
      },
      {
        q: "Can I import my existing clients?",
        a: "Yes. CSV import is available in the Clients section. Map your columns to HelmSmart fields and your contacts are ready to use in minutes.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Everything you need to know about HelmSmart.
          </p>
        </div>

        {/* FAQ Categories */}
        <div className="space-y-12">
          {faqs.map((section) => (
            <section key={section.category}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                {section.category}
              </h2>
              <div className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                {section.questions.map(({ q, a }) => (
                  <details
                    key={q}
                    className="group px-6 py-5 [&[open]>summary>span>svg]:rotate-180"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                      <span className="text-base font-medium text-gray-900">
                        {q}
                      </span>
                      <span className="flex-shrink-0 text-gray-400">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-5 w-5 transition-transform duration-200"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    </summary>
                    <p className="mt-3 text-base leading-relaxed text-gray-600">
                      {a}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* CTA footer */}
        <div className="mt-20 rounded-2xl bg-gray-50 px-8 py-10 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Still have questions?
          </h3>
          <p className="mt-2 text-base text-gray-500">
            We&apos;re happy to help. Reach out and we&apos;ll get back to you
            within one business day.
          </p>
          <a
            href="mailto:contact@helmsmart.ai"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Contact support
          </a>
        </div>
      </div>
    </main>
  );
}

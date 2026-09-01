import type { Metadata } from "next";

export const runtime = "nodejs";

/**
 * Where the footer's Unsubscribe link lands once the opt-out is recorded.
 *
 * The work already happened in `/api/email/unsubscribe`; this only tells the
 * person it worked. That matters more than it looks: someone who asked to be
 * left alone and lands on raw JSON — or on nothing — concludes it failed, and
 * the next click is the spam button, which costs the sending domain far more
 * than the unsubscribe did.
 *
 * Deliberately says nothing about WHICH address or agent. The link travels in
 * the clear and may be opened by anyone it was forwarded to; confirming who is
 * in the CRM to whoever holds the URL is not a trade worth making.
 */

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function UnsubscribedPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-lg px-5 py-24">
        <h1 className="text-2xl font-semibold">You&rsquo;re unsubscribed</h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          You won&rsquo;t receive any more marketing email from this agent. It can take
          a little while for anything already on its way to stop.
        </p>
        <p className="mt-3 leading-relaxed text-slate-600">
          If you still want to hear from them about something specific, just reply
          to any message they&rsquo;ve sent you.
        </p>
      </div>
    </main>
  );
}

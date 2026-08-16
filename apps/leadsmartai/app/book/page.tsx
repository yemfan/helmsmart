import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = pageMetadata({
  title: "Schedule a Demo — CloseBoss",
  description: "Book a live demo of your AI real estate team.",
  path: "/book",
});

/**
 * Real demo scheduler. The booking page (Cal.com / Calendly / any embeddable
 * scheduler) is supplied via NEXT_PUBLIC_DEMO_BOOKING_URL and shown in an iframe.
 * Until that's set, we fall back to the working contact form rather than the old
 * mock flow (which showed fake leads + past dates and booked nothing).
 */
const BOOKING_URL =
  process.env.NEXT_PUBLIC_DEMO_BOOKING_URL?.trim() ||
  "https://cal.com/closeboss/closeboss-demo";

export default async function BookingPage() {
  const t = await getServerT();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Back to home">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Schedule a Demo</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {BOOKING_URL ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <iframe
              src={BOOKING_URL}
              title="Schedule a demo with CloseBoss"
              className="w-full"
              style={{ height: "760px", border: "0" }}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Let&apos;s find a time</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Tell us a bit about your business and when works for you, and we&apos;ll
              reach out to confirm your demo.
            </p>
            <Link
              href="/contact"
              className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Request a demo
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

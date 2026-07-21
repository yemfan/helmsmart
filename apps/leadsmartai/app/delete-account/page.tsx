import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your LeadSmart account",
  description:
    "How to permanently delete your CloseBoss account and the personal data we hold about you. Required disclosure under Apple App Store and Google Play account-deletion policies.",
  alternates: { canonical: "/delete-account" },
  robots: { index: true, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Delete your LeadSmart account
      </h1>
      <p className="text-sm text-slate-500 mb-8">
        This page explains how to permanently delete your CloseBoss account and
        the personal data associated with it. You can request deletion from inside
        the mobile app or from this page — both paths reach the same workflow.
      </p>

      <section className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          From the LeadSmart mobile app
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>Open the LeadSmart app and sign in.</li>
          <li>
            Go to the <strong>Settings</strong> tab.
          </li>
          <li>
            Scroll to the bottom and tap <strong>Delete account</strong>.
          </li>
          <li>
            Confirm by typing <code>DELETE</code> and tapping the red
            confirmation button.
          </li>
        </ol>
        <p className="mt-3 text-sm text-slate-600">
          Your sign-in credentials are revoked immediately. You will be returned
          to the login screen and will no longer be able to access your account.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          If you no longer have the app installed
        </h2>
        <p className="text-sm text-slate-700 mb-3">
          Send an email to{" "}
          <a
            href="mailto:contact@closebossai.com?subject=Account%20deletion%20request"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>{" "}
          from the address associated with your LeadSmart account, with the
          subject line <strong>&ldquo;Account deletion request&rdquo;</strong>.
          We will confirm receipt and complete the deletion within five business
          days.
        </p>
        <p className="text-sm text-slate-700">
          We may ask one verification question (e.g. the brokerage you signed up
          with, or the date you created your account) before processing the
          request — this protects you against someone else requesting deletion
          on your behalf.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          What gets deleted
        </h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>
            Your sign-in credentials (email, password hash, OAuth identity
            links).
          </li>
          <li>
            Your agent profile — name, phone, brokerage, photo, service areas,
            branding preferences.
          </li>
          <li>
            Lead records, conversations (SMS and email), tasks, calendar
            events, reminders, posts, and notes attributed to your account.
          </li>
          <li>Push notification tokens and device records.</li>
          <li>
            Integration links to third-party services (Zillow, Realtor.com,
            Follow Up Boss, Facebook Lead Ads, LinkedIn, etc.). The third
            parties retain whatever data they hold under their own policies —
            you must contact them separately to remove that data.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          What we keep, and for how long
        </h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>
            <strong>Billing and tax records</strong> required by law (invoices,
            payment receipts) — retained for the period required by applicable
            tax regulation, typically seven years. These records do not contain
            CRM lead data.
          </li>
          <li>
            <strong>Aggregated and de-identified usage statistics</strong> used
            to operate and improve the Service. These contain no personal
            identifiers after deletion.
          </li>
          <li>
            <strong>Backup snapshots</strong> for up to 30 days after deletion,
            after which they are overwritten on the normal backup-rotation
            schedule.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Timing
        </h2>
        <p className="text-sm text-slate-700">
          Your account is locked and your credentials revoked immediately when
          you confirm deletion in the app (or when we verify an email request).
          Hard deletion of the underlying data completes within 30 days. After
          that, no copy of your CRM data remains outside the retention
          categories listed above.
        </p>
      </section>

      <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        See also our{" "}
        <Link href="/privacy" className="text-[#0072ce] hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="text-[#0072ce] hover:underline">
          Terms of Service
        </Link>
        .
      </div>
    </div>
  );
}

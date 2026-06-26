"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSignupProfilePrefill, type SignupPrefillConsumer } from "@/lib/hooks/useSignupProfilePrefill";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Default property used when the page is visited without a
 * `property_id` query param. The real flow is: agent prints a flyer
 * with a QR code that resolves to `/open-house-signup?property_id=...`,
 * visitor scans it at the open house, signs up.
 *
 * The default exists so TCR (Twilio Campaign Registry) and other CTA
 * verifiers landing on the bare URL still see a working opt-in
 * surface — the page didn't render usefully before, which caused the
 * A2P 10DLC campaign rejection we're addressing here.
 */
const DEFAULT_PROPERTY_ADDRESS = "123 Main St, Los Angeles, CA 90001";

export default function OpenHouseSignupPage() {
  return (
    <Suspense fallback={null}>
      <OpenHouseSignupPageInner />
    </Suspense>
  );
}

function OpenHouseSignupPageInner() {
  const searchParams = useSearchParams();
  const propertyId = searchParams?.get("property_id") ?? "";
  const agentId = searchParams?.get("agent_id") ?? "";
  // True when no real property_id was passed — the page shows a demo
  // surface using the default address. Submissions still record consent
  // + create a lead, but the report-generation step is skipped server-side.
  const isDemo = !propertyId;

  const { values: prefill, loading: prefillLoading } = useSignupProfilePrefill("consumer");
  const pv = prefill as SignupPrefillConsumer;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [wantMoreInfo, setWantMoreInfo] = useState(false);
  const [wantSimilar, setWantSimilar] = useState(false);
  const [wantValuation, setWantValuation] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  useEffect(() => {
    if (prefillLoading) return;
    setName((n) => (n.trim() ? n : pv.fullName));
    setEmail((e) => (e.trim() ? e : pv.email));
    setPhone((p) => (p.trim() ? p : pv.phone));
  }, [prefillLoading, pv]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [message]);

  const title = useMemo(() => "Sign up for Open House Updates", []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!name.trim()) {
      setMessage({ type: "error", text: "Name is required." });
      return;
    }
    if (!email.trim()) {
      setMessage({ type: "error", text: "Email is required." });
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setMessage({ type: "error", text: "Please enter a valid email address." });
      return;
    }
    if (!phone.trim()) {
      setMessage({ type: "error", text: "Phone is required." });
      return;
    }
    if (smsConsent && !phone.trim()) {
      // Defensive — covered above, but keep the explicit check so the
      // server-side audit row never lands with smsConsent=true and a
      // null phone.
      setMessage({ type: "error", text: "Please provide a phone number to receive SMS." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/open-house-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          notes: notes.trim() ? notes : undefined,
          // Pass property_id only when present. Server uses default
          // address when omitted (demo / verifier path).
          property_id: propertyId || undefined,
          agent_id: agentId || undefined,
          smsConsent,
          preferences: {
            want_more_info: wantMoreInfo,
            want_similar_properties: wantSimilar,
            want_home_valuation: wantValuation,
          },
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null;

      if (!res.ok || !payload?.success) {
        setMessage({
          type: "error",
          text: payload?.message || "Something went wrong submitting your signup.",
        });
        return;
      }

      setMessage({
        type: "success",
        text: payload.message || "Thanks! We will be in touch shortly.",
      });

      setName("");
      setEmail("");
      setPhone("");
      setNotes("");
      setSmsConsent(false);
    } catch (err) {
      console.error("Open house signup failed", err);
      setMessage({
        type: "error",
        text: "Network error submitting your signup. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">
              Leave your info and we will follow up with open house updates.
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Property:</span>{" "}
              {isDemo ? DEFAULT_PROPERTY_ADDRESS : "Loading property…"}
              {isDemo && (
                <span className="ml-1 text-slate-500">
                  (default demo property — scan a property QR code for
                  property-specific signup)
                </span>
              )}
            </div>
          </div>

          <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800">
                Name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800">
                Email
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800">
                Phone
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800">
                Notes (optional)
              </label>
              <textarea
                className="mt-1 w-full min-h-[100px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything you'd like the agent to know?"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">I&apos;m interested in:</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={wantMoreInfo} onChange={(e) => setWantMoreInfo(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                More information about this property
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={wantSimilar} onChange={(e) => setWantSimilar(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                Similar properties on the market
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={wantValuation} onChange={(e) => setWantValuation(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                A home valuation for my property
              </label>
            </div>

            {/* SMS opt-in — Twilio TFV / A2P proof-of-consent surface.
                Identical four-element disclosure to /contact (same
                disclosure-version pin in lib/consent/disclosureVersions
                ensures the audit row carries the same wording string).
                Do not edit without bumping the version. */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <label htmlFor="oh-sms-consent" className="flex cursor-pointer items-start gap-3">
                <input
                  id="oh-sms-consent"
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">
                    Yes, send me marketing text messages from RealtyBoss.
                  </span>{" "}
                  By checking this box and providing my phone number above, I consent
                  to receive promotional text messages from{" "}
                  <strong>RealtyBoss</strong> about real-estate services, new
                  listings, market updates, and special offers.
                </span>
              </label>
              <p className="mt-3 pl-7 text-xs leading-relaxed text-slate-500">
                Message frequency varies. Message and data rates may apply. Reply{" "}
                <strong>STOP</strong> to opt out at any time, or <strong>HELP</strong> for
                help. Consent is not a condition of any purchase. See our{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Terms of Service
                </a>{" "}
                for details.
              </p>
            </div>

            <button
              disabled={submitting}
              type="submit"
              className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>

          {message ? (
            <div
              ref={messageRef}
              className={
                "mt-4 rounded-xl px-4 py-3 text-sm " +
                (message.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200")
              }
              role={message.type === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {message.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicOpenHouseInfo } from "@/lib/open-houses/publicService";
import type {
  VisitorBuyerStatus,
  VisitorTimeline,
} from "@/lib/open-houses/types";

/**
 * Mobile-first open-house sign-in form. No auth — agent shares the
 * URL via QR. Big tap targets, minimal scroll on a phone.
 *
 * Post-submit: we show a friendly confirmation. Agent can tap "Sign
 * in another visitor" to reset and hand off to the next person.
 */
export function OpenHouseSigninClient({ info }: { info: PublicOpenHouseInfo }) {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isBuyerAgented, setIsBuyerAgented] = useState(false);
  const [buyerAgentName, setBuyerAgentName] = useState("");
  const [buyerAgentBrokerage, setBuyerAgentBrokerage] = useState("");
  const [timeline, setTimeline] = useState<VisitorTimeline | "">("");
  const [buyerStatus, setBuyerStatus] = useState<VisitorBuyerStatus | "">("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() && !email.trim() && !phone.trim()) {
      setError("Please enter at least your name, email, or phone.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/open-house/${info.slug}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          isBuyerAgented,
          buyerAgentName: isBuyerAgented ? buyerAgentName.trim() || null : null,
          buyerAgentBrokerage:
            isBuyerAgented ? buyerAgentBrokerage.trim() || null : null,
          timeline: timeline || null,
          buyerStatus: buyerStatus || null,
          marketingConsent,
          notes: null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Sign-in failed. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNext() {
    setName("");
    setEmail("");
    setPhone("");
    setIsBuyerAgented(false);
    setBuyerAgentName("");
    setBuyerAgentBrokerage("");
    setTimeline("");
    setBuyerStatus("");
    setMarketingConsent(false);
    setSubmitted(false);
    setError(null);
  }

  const locationLine = [info.city, info.state, info.zip].filter(Boolean).join(", ");

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="text-5xl">✅</div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">{t("pages.openHouseSignin.thanks")}</h1>
          <p className="mt-2 text-slate-600">
            {info.hostAgentFirstName
              ? `${info.hostAgentFirstName} is around — feel free to ask questions about the home.`
              : "Feel free to walk around and explore the home."}
          </p>
          <button
            type="button"
            onClick={resetForNext}
            className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800"
          >{t("pages.openHouseSignin.signInAnother")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">{t("pages.openHouseSignin.openHouse")}</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {info.propertyAddress}
          </h1>
          {locationLine ? (
            <div className="text-sm text-slate-600">{locationLine}</div>
          ) : null}
          {info.listPrice ? (
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(info.listPrice)}
            </div>
          ) : null}

          {/* Quick property facts — beds / baths / sqft / year. Skipped
              when the warehouse has no row for this address. Each chip
              renders only when its value is present so a partial row
              still looks intentional. */}
          {(info.beds != null || info.baths != null || info.sqft != null ||
            info.yearBuilt != null || info.propertyType) ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-700">
              {info.beds != null ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5">
                  <strong className="font-semibold">{info.beds}</strong> bd
                </span>
              ) : null}
              {info.baths != null ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5">
                  <strong className="font-semibold">{info.baths}</strong> ba
                </span>
              ) : null}
              {info.sqft != null ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5">
                  <strong className="font-semibold">{info.sqft.toLocaleString()}</strong> sqft
                </span>
              ) : null}
              {info.yearBuilt != null ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5">{t("pages.openHouseSignin.built")} <strong className="font-semibold">{info.yearBuilt}</strong>
                </span>
              ) : null}
              {info.propertyType ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5">
                  {info.propertyType}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Two action buttons for visitors who want to learn more
              before signing in. "See property details" opens whatever
              listing URL the agent saved (typically Zillow / MLS
              public link). "Search similar nearby" routes them to
              /homes/search filtered by the open house's city/state/zip
              so they leave with a list of comparables — useful for
              visitors at the wrong price point or wrong location. */}
          {(info.mlsUrl || info.city || info.zip) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {info.mlsUrl ? (
                <a
                  href={info.mlsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
                >
                  See property details →
                </a>
              ) : null}
              {(info.city || info.zip) ? (
                <a
                  href={(() => {
                    const params = new URLSearchParams();
                    if (info.city) params.set("city", info.city);
                    if (info.state) params.set("state", info.state);
                    if (info.zip) params.set("zip", info.zip);
                    return `/homes/search?${params.toString()}`;
                  })()}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
                >
                  Search similar nearby →
                </a>
              ) : null}
            </div>
          ) : null}

          {info.hostAgentFirstName ? (
            <p className="mt-3 text-sm text-slate-500">{t("pages.openHouseSignin.hostedBy")} {info.hostAgentFirstName}
              {info.hostAgentHeadline ? ` · ${info.hostAgentHeadline}` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700">{t("pages.openHouseSignin.yourName")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{t("pages.articleChrome.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{t("pages.articleChrome.phone")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{t("pages.openHouseSignin.workingWithAgent")}</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsBuyerAgented(false)}
                className={`rounded-xl border px-3 py-3 text-base font-medium ${
                  !isBuyerAgented
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setIsBuyerAgented(true)}
                className={`rounded-xl border px-3 py-3 text-base font-medium ${
                  isBuyerAgented
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >{t("pages.openHouseSignin.yes")}</button>
            </div>
          </div>

          {isBuyerAgented ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">{t("pages.openHouseSignin.agentName")}</label>
                <input
                  value={buyerAgentName}
                  onChange={(e) => setBuyerAgentName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">{t("pages.openHouseSignin.brokerage")}</label>
                <input
                  value={buyerAgentBrokerage}
                  onChange={(e) => setBuyerAgentBrokerage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-slate-700">{t("pages.openHouseSignin.whenBuying")}</label>
            <select
              value={timeline}
              onChange={(e) => setTimeline(e.target.value as VisitorTimeline | "")}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            >
              <option value="">—</option>
              <option value="now">{t("pages.openHouseSignin.activelyLooking")}</option>
              <option value="3_6_months">{t("pages.openHouseSignin.in36")}</option>
              <option value="6_12_months">{t("pages.openHouseSignin.in612")}</option>
              <option value="later">{t("pages.openHouseSignin.exploringLater")}</option>
              <option value="just_looking">{t("pages.openHouseSignin.justCurious")}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              You are…
            </label>
            <select
              value={buyerStatus}
              onChange={(e) => setBuyerStatus(e.target.value as VisitorBuyerStatus | "")}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            >
              <option value="">—</option>
              <option value="looking">{t("pages.openHouseSignin.activeBuyer")}</option>
              <option value="just_browsing">{t("pages.openHouseSignin.justBrowsing")}</option>
              <option value="neighbor">{t("pages.openHouseSignin.aNeighbor")}</option>
              <option value="other">{t("pages.openHouseSignin.other")}</option>
            </select>
          </div>

          {!isBuyerAgented ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span className="text-sm text-slate-700">{t("pages.openHouseSignin.marketingOptIn")}</span>
            </label>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-[11px] text-slate-400">{t("pages.openHouseSignin.poweredBy")}</p>
        </div>
      </div>
    </div>
  );
}

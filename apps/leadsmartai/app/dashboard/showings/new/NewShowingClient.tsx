"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddressAutocomplete, {
  type AddressAutocompleteValue,
} from "@/components/AddressAutocomplete";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";
import {
  RecentAddressList,
  type RecentAddress,
} from "@/components/crm/RecentAddressList";
import {
  detectPlatform,
  platformLabel,
  type ListingPlatform,
} from "@/lib/listingUrl";


/**
 * Listing-status check the form runs after a Google Places pick. The
 * agent should never schedule a showing on a deal that's already in
 * pending / sold / withdrawn — surface a banner so they can confirm
 * with the listing agent before sending the buyer.
 */
type StatusBanner = {
  tone: "ok" | "warn" | "info";
  text: string;
};

const ACTIVE_STATUS_RE = /^(active|active_under_contract|coming_soon|new)$/i;

/** Pick a string field from a loosely-typed property data blob, trying
 *  several common naming variants since the upstream listing source
 *  isn't strict. */
function readBlobString(blob: unknown, ...keys: string[]): string | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Schedule a new showing. Accepts `?contactId=<uuid>` for deep-link
 * prefill (e.g. from the Contacts page "Schedule showing" action or
 * from the Showings list filter).
 *
 * Time is captured as a date + time input pair rather than a datetime-
 * local because real-estate showings are always same-day — agents think
 * "Saturday at 2pm," not "2026-05-15T14:00." Combining the two into a
 * timestamptz happens at submit time.
 */

function NewShowingForm() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams?.get("contactId") ?? "";
  const inboundId = searchParams?.get("inboundId") ?? null;

  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateValue] = useState("CA");
  const [zip, setZip] = useState("");
  const [mlsUrl, setMlsUrl] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");
  const [date, setDate] = useState(defaultDateIso());
  const [time, setTime] = useState("14:00");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [accessNotes, setAccessNotes] = useState("");
  const [listingAgentName, setListingAgentName] = useState("");
  const [listingAgentEmail, setListingAgentEmail] = useState("");
  const [listingAgentPhone, setListingAgentPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Banner shown when prefill came from a forwarded showing-request email. */
  const [inboundSource, setInboundSource] = useState<{
    id: string;
    subject: string | null;
    fromHeader: string | null;
  } | null>(null);

  /** Listing-URL autodetect state. Set when the agent pastes a Zillow /
   *  Redfin / Realtor / Compass URL — we show a small badge under the
   *  input + auto-fill any empty address fields. */
  const [listingUrlDetected, setListingUrlDetected] = useState<{
    platform: ListingPlatform;
    label: string;
    status: "looking-up" | "filled" | "address-only" | "failed";
    note?: string;
  } | null>(null);

  /**
   * Phase 2B-2: prefill from a forwarded showing-request email. The
   * /dashboard/inbound/[id] review page hops to here with
   * `?inboundId=<uuid>&contactId=<optional>`. We fetch the delivery,
   * lift the structured ShowingRequestExtraction onto the form,
   * and skip the agent's manual data entry.
   *
   * Address autocomplete + listing-status lookup *don't* fire on
   * prefill — the agent can re-pick the address to retrigger them
   * if they want the listing-status banner. Otherwise the form just
   * has the parsed values and the agent reviews + saves.
   */
  useEffect(() => {
    if (!inboundId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/dashboard/inbound/${inboundId}`);
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          delivery?: {
            id: string;
            subject: string | null;
            from_header: string | null;
            extraction_status: string;
            // Discriminated union — every branch needs a *literal*
            // `kind`, otherwise TS can't narrow the type after a
            // `kind === "showing_request"` check (a wider `kind: string`
            // branch swallows the narrowing because string is wider
            // than the literal). Listing extractor is deliberately
            // typed loosely — we only act on showing_request here.
            extraction:
              | {
                  kind: "showing_request";
                  data: {
                    requesterName: string | null;
                    requesterPhone: string | null;
                    requesterEmail: string | null;
                    propertyAddress: string | null;
                    city: string | null;
                    state: string | null;
                    zip: string | null;
                    requestedDate: string | null;
                    requestedTime: string | null;
                    notes: string | null;
                  };
                }
              | { kind: "offer"; data: Record<string, unknown> }
              | { kind: "listing_agreement"; data: Record<string, unknown> }
              | null;
          };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.delivery) {
          setError(body.error ?? "Couldn't load forwarded email.");
          return;
        }
        const d = body.delivery;
        setInboundSource({
          id: d.id,
          subject: d.subject,
          fromHeader: d.from_header,
        });
        if (
          d.extraction_status === "extracted" &&
          d.extraction &&
          d.extraction.kind === "showing_request"
        ) {
          const e = d.extraction.data;
          if (e.propertyAddress) setPropertyAddress(e.propertyAddress);
          if (e.city) setCity(e.city);
          if (e.state) setStateValue(e.state);
          if (e.zip) setZip(e.zip);
          if (e.requestedDate) setDate(e.requestedDate);
          if (e.requestedTime) setTime(e.requestedTime);
          if (e.notes) setNotes(e.notes);
        } else {
          setError(
            d.extraction_status === "failed"
              ? "AI extraction failed for this email — go back and retry from the review page."
              : "This forwarded email doesn't have a parsed showing request yet — open the review page first.",
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inboundId]);

  // Listing-status banner shown after a Google Places address pick.
  // Driven by /api/property/{address} → latest_snapshot.listing_status.
  // Cleared whenever the agent edits the address line again.
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  /**
   * True once a Google Places pick (or a prior-address chip) has fired,
   * meaning city/state/zip were captured from a real address rather
   * than left at the form's default ("CA"). The chips beneath the
   * address input only render when this is true so the agent doesn't
   * see a misleading "CA" chip when autocomplete never fired.
   */
  const [addressVerified, setAddressVerified] = useState(false);

  /** Quick-pick a prior address. Skips Google but still validates the
   *  listing status against the property service. `onAddressPick`
   *  flips `addressVerified=true` for us — same path as a real Google
   *  pick. */
  function pickPriorAddress(addr: RecentAddress) {
    void onAddressPick({
      formattedAddress: addr.property_address,
      lat: null,
      lng: null,
      components: {
        streetNumber: null,
        streetName: null,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
      },
    });
  }

  /**
   * After Google Places returns a chosen Place, copy the parsed
   * city/state/zip into the form, then kick off a property-data lookup
   * to validate the listing is active and auto-fill anything else we
   * can scrape (MLS #, listing URL, agent name/email/phone).
   */
  async function onAddressPick(val: AddressAutocompleteValue) {
    setPropertyAddress(val.formattedAddress);
    if (val.components.city) setCity(val.components.city);
    if (val.components.state) setStateValue(val.components.state);
    if (val.components.zip) setZip(val.components.zip);
    setAddressVerified(true);

    setStatusBanner(null);
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/property/${encodeURIComponent(val.formattedAddress)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        latest_snapshot?: {
          listing_status?: string | null;
          data?: unknown;
        } | null;
      };
      if (!res.ok || !body.ok) {
        // Lookup failure is non-fatal; the agent can still submit.
        setStatusBanner({
          tone: "info",
          text: t("pages.newShowing.lookupFailed"),
        });
        return;
      }

      const status = body.latest_snapshot?.listing_status?.trim() || null;
      if (status) {
        if (ACTIVE_STATUS_RE.test(status)) {
          setStatusBanner({ tone: "ok", text: `Listing status: ${status}` });
        } else {
          setStatusBanner({
            tone: "warn",
            text: `Heads up — this listing is ${status}, not Active. Confirm with the listing agent before sending the buyer.`,
          });
        }
      } else {
        setStatusBanner({
          tone: "info",
          text: t("pages.newShowing.noMls"),
        });
      }

      // Best-effort auto-fill from the data blob. Field names vary by
      // upstream listing source so we try a few common spellings.
      const blob = body.latest_snapshot?.data;
      const mls = readBlobString(blob, "mlsNumber", "mls_number", "mls", "mlsId");
      if (mls && !mlsNumber) setMlsNumber(mls);
      const url = readBlobString(blob, "listingUrl", "listing_url", "url");
      if (url && !mlsUrl) setMlsUrl(url);
      const agentName = readBlobString(
        blob,
        "listingAgentName",
        "listing_agent_name",
        "agentName",
      );
      if (agentName && !listingAgentName) setListingAgentName(agentName);
      const agentEmail = readBlobString(
        blob,
        "listingAgentEmail",
        "listing_agent_email",
        "agentEmail",
      );
      if (agentEmail && !listingAgentEmail) setListingAgentEmail(agentEmail);
      const agentPhone = readBlobString(
        blob,
        "listingAgentPhone",
        "listing_agent_phone",
        "agentPhone",
      );
      if (agentPhone && !listingAgentPhone) setListingAgentPhone(agentPhone);
    } catch {
      setStatusBanner({
        tone: "info",
        text: t("pages.newShowing.serviceDown"),
      });
    } finally {
      setLookupLoading(false);
    }
  }

  /**
   * Detect when a Zillow/Redfin/Realtor/Compass URL has been pasted
   * into the Property Address field (NOT the Listing URL field —
   * different handler below). When detected, fetch listing data,
   * call onAddressPick with the parsed address (which auto-fills
   * city/state/zip), and replace the URL in the Address field with
   * the actual address. The Listing URL field also gets populated
   * with the original URL so the agent has the source on file.
   *
   * Why a separate handler from `detectListingUrl`: the Address
   * field's autofill story is bigger (city/state/zip + downstream
   * property-data lookup, mirroring the Google-Places onPick path)
   * and we want to clear the URL out of the field once parsed.
   * The Listing URL field keeps the URL visible by design.
   */
  async function detectAddressFieldUrl(rawValue: string) {
    const value = rawValue.trim();
    const platform = detectPlatform(value);
    if (!platform) return;
    const label = platformLabel(platform);
    setStatusBanner({ tone: "info", text: t("pages.listingLookup.detected", { label }) });
    try {
      const res = await fetch(
        `/api/property/from-listing?url=${encodeURIComponent(value)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        address?: string | null;
        data?: unknown;
        // Tells us where listing_status came from so the banner can
        // qualify with "per MLS" vs "per <listing site>". Rentcast
        // = MLS authority; scrape = the listing site's own
        // availability flag (Schema.org InStock/SoldOut), which is
        // useful but coarser than MLS.
        listing_status_source?: "rentcast" | "scrape" | null;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.address) {
        setStatusBanner({
          tone: "info",
          text: `${label} URL detected, but couldn't extract listing details. Type the address manually.`,
        });
        return;
      }
      // Construct an AddressAutocompleteValue-shaped object from the
      // parsed data so we can reuse onAddressPick — same flow as a
      // Google-Places suggestion pick. Lat/lng come back null since
      // listing parsers don't include geo coords; the downstream
      // property-data fetch only needs the address string anyway.
      const blobCity = readBlobString(body.data, "city");
      const blobState = readBlobString(body.data, "state");
      const blobZip = readBlobString(body.data, "zip", "zip_code", "zipCode");
      // Pre-extract the parsed listing status (if available) so we
      // can override the warehouse-style banner that onAddressPick
      // sets — see the listingStatusFromUrl handling below.
      const listingStatusFromUrl = readBlobString(body.data, "listing_status", "listingStatus", "status");
      const statusSource = body.listing_status_source ?? null;
      // Await onAddressPick so the warehouse-fetch banner has
      // settled before we override it. Otherwise the override fires
      // first, then the in-flight `/api/property/{address}` lookup
      // races us and clobbers it with "No MLS status on file."
      await onAddressPick({
        formattedAddress: body.address,
        lat: null,
        lng: null,
        components: {
          streetNumber: null,
          streetName: null,
          city: blobCity,
          state: blobState,
          zip: blobZip,
        },
      });
      // Override the banner now that onAddressPick is done. We KNOW
      // this listing exists — the agent literally pasted the URL —
      // so "No MLS status on file" is misleading even when our
      // warehouse lookup didn't return anything. Re-render with a
      // URL-aware message that matches reality, qualifying the
      // status source ("per MLS" vs "per <site>") so the agent
      // knows whether they're seeing authoritative data:
      //
      //   active + MLS    → ok    "Listed on Zillow · Active (per MLS)"
      //   active + scrape → ok    "Listed on Zillow · Active (per Zillow — verify with listing agent)"
      //   non-active      → warn  "Listed on Zillow as Pending (per <source>)…"
      //   no status       → info  "Listed on Zillow — couldn't read live status, confirm with the listing agent."
      const sourceQualifier =
        statusSource === "rentcast"
          ? "per MLS"
          : statusSource === "scrape"
            ? `per ${label} — coarse signal, verify with listing agent`
            : null;
      if (listingStatusFromUrl && ACTIVE_STATUS_RE.test(listingStatusFromUrl)) {
        setStatusBanner({
          tone: "ok",
          text: sourceQualifier
            ? `Listed on ${label} · ${listingStatusFromUrl} (${sourceQualifier})`
            : `Listed on ${label} · ${listingStatusFromUrl}`,
        });
      } else if (listingStatusFromUrl) {
        setStatusBanner({
          tone: "warn",
          text: sourceQualifier
            ? `Listed on ${label} as ${listingStatusFromUrl} (${sourceQualifier}) — confirm with the listing agent before sending the buyer.`
            : `Listed on ${label} as ${listingStatusFromUrl} — confirm with the listing agent before sending the buyer.`,
        });
      } else {
        setStatusBanner({
          tone: "info",
          text: `Listed on ${label} — couldn't read live status from our side, confirm with the listing agent before sending the buyer.`,
        });
      }
      // Park the original URL in the Listing URL field so it doesn't
      // get lost — only when that field is empty (don't clobber a URL
      // the agent already pasted there).
      if (!mlsUrl.trim()) setMlsUrl(value);
    } catch (e) {
      setStatusBanner({
        tone: "info",
        text:
          e instanceof Error
            ? `${label} URL lookup failed: ${e.message}`
            : `${label} URL lookup failed.`,
      });
    }
  }

  /**
   * Listing-URL autodetect.
   *
   * Triggered when the agent pastes/edits the "Listing URL" field. If
   * the URL is from a recognized platform (Zillow, Redfin, Realtor,
   * Compass), we hit /api/property/from-listing to extract the
   * address + property data and auto-fill empty fields. The agent
   * gets a small badge under the input ("Zillow detected · auto-
   * filled") so they know what just happened.
   *
   * Non-fatal: a fetch failure or unrecognized URL leaves the URL
   * value as plain text and falls through to manual entry.
   */
  async function detectListingUrl(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) {
      setListingUrlDetected(null);
      return;
    }
    const platform = detectPlatform(url);
    if (!platform) {
      setListingUrlDetected(null);
      return;
    }
    const label = platformLabel(platform);
    setListingUrlDetected({ platform, label, status: "looking-up" });

    try {
      const res = await fetch(
        `/api/property/from-listing?url=${encodeURIComponent(url)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        platform?: string;
        address?: string | null;
        data?: unknown;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.address) {
        setListingUrlDetected({
          platform,
          label,
          status: "failed",
          note: body.error ?? "Couldn't extract listing details.",
        });
        return;
      }

      // Auto-fill empty fields only — never overwrite anything the
      // agent already typed. Address is the most useful prefill;
      // city/state/zip come from the data blob if present.
      let filledAnything = false;
      if (!propertyAddress.trim()) {
        setPropertyAddress(body.address);
        filledAnything = true;
      }
      const blob = body.data;
      const blobCity = readBlobString(blob, "city");
      const blobState = readBlobString(blob, "state");
      const blobZip = readBlobString(blob, "zip", "zip_code", "zipCode");
      if (blobCity && !city) {
        setCity(blobCity);
        filledAnything = true;
      }
      if (blobState && state === "CA") {
        // "CA" is the form's default — overwrite it only when the URL
        // actually carries a different state.
        setStateValue(blobState);
        filledAnything = true;
      }
      if (blobZip && !zip) {
        setZip(blobZip);
        filledAnything = true;
      }
      const blobMls = readBlobString(blob, "mlsNumber", "mls_number", "mls", "mlsId");
      if (blobMls && !mlsNumber) {
        setMlsNumber(blobMls);
        filledAnything = true;
      }
      // Mark address as verified so the chips below the input render
      // with what we just learned, mirroring the Google-Places path.
      if (filledAnything) setAddressVerified(true);

      setListingUrlDetected({
        platform,
        label,
        status: filledAnything ? "filled" : "address-only",
        note: filledAnything
          ? `Auto-filled from ${label}.`
          : `Address parsed but the form is already filled — leaving values alone.`,
      });
    } catch (e) {
      setListingUrlDetected({
        platform,
        label,
        status: "failed",
        note: e instanceof Error ? e.message : "Network error.",
      });
    }
  }

  const scheduledAtIso = useMemo(() => {
    if (!date || !time) return null;
    // Combine as local time then toISOString — agent's browser locale is
    // the authoritative one. Agents in PT scheduling 2pm means PT 2pm.
    const dt = new Date(`${date}T${time}:00`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }, [date, time]);

  async function submit() {
    setError(null);
    if (!contact?.id || !propertyAddress.trim() || !scheduledAtIso) {
      setError(t("pages.newShowing.errRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/showings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          propertyAddress: propertyAddress.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          mlsNumber: mlsNumber.trim() || null,
          mlsUrl: mlsUrl.trim() || null,
          scheduledAt: scheduledAtIso,
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          accessNotes: accessNotes.trim() || null,
          listingAgentName: listingAgentName.trim() || null,
          listingAgentEmail: listingAgentEmail.trim() || null,
          listingAgentPhone: listingAgentPhone.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        showing?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.showing) {
        setError(body.error ?? "Failed to schedule showing.");
        return;
      }
      router.push(`/dashboard/showings/${body.showing.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/showings" className="hover:underline">{t("pages.newShowing.showings")}</Link>
          {" / New"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.newShowing.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.newShowing.sub")}</p>
      </div>

      {/* Banner shown when prefill arrived from a forwarded showing-
          request email (Phase 2B-2). Tells the agent the parsed
          fields below came from the inbound pipeline; back-link to
          the review page so they can compare against the source. */}
      {inboundSource && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-medium">{t("pages.newShowing.prefilled")}</div>
          <div className="mt-0.5 text-xs text-emerald-700">
            {inboundSource.subject ? `“${inboundSource.subject}”` : "(no subject)"}
            {inboundSource.fromHeader ? ` · from ${inboundSource.fromHeader}` : ""}
            {" · "}
            <Link
              href={`/dashboard/inbound/${inboundSource.id}`}
              className="underline hover:text-emerald-900"
            >{t("pages.newShowing.viewSource")}</Link>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.buyer")}</label>
          <ContactPicker
            value={contact}
            onChange={setContact}
            initialContactId={prefilledContactId || null}
            helperText="Start typing the buyer's name, email, or phone."
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.address")}</label>

          {/* Recent addresses from this buyer's showings + offers
              history. Vertical list with source tag (Showing / Offer)
              + relative age — easier to read than a horizontal chip
              strip when a buyer's been to several properties. Hidden
              entirely until a buyer is selected. */}
          <RecentAddressList contactId={contact?.id ?? null} onPick={pickPriorAddress} />

          <AddressAutocomplete
            value={propertyAddress}
            onChange={(v) => {
              setPropertyAddress(v);
              // Edits after a pick invalidate the verified status — clear
              // the banner + chip rendering so the agent re-confirms on
              // the next pick.
              if (statusBanner) setStatusBanner(null);
              if (addressVerified) setAddressVerified(false);
              // URL autodetect — when the agent pastes a Zillow / Redfin
              // / Realtor / Compass link into the Address field, treat
              // it the same way as a Google-Places pick: parse out the
              // address, fill city/state/zip, and clear the URL out of
              // the input. detectPlatform short-circuits the no-op
              // case (plain address text returns null instantly) so
              // there's no perf hit on normal typing.
              if (detectPlatform(v)) {
                void detectAddressFieldUrl(v);
              }
            }}
            onSelect={onAddressPick}
            placeholder={t("pages.newShowing.addressHint")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {/* Parsed city/state/zip render as small chips beneath the
              input — only when autocomplete actually fired so we don't
              show a misleading "CA" chip from the form's default state.
              All three feed the submit body transparently. */}
          {addressVerified && (city || state || zip) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              {city ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{city}</span>
              ) : null}
              {state ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{state}</span>
              ) : null}
              {zip ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{zip}</span>
              ) : null}
            </div>
          ) : null}
          {/* Fallback: agent typed an address but never picked a
              suggestion (Google API key missing, slow load, or they
              ignored the dropdown). Reveal manual city/state/zip
              inputs so the showing can still be saved with location
              data. */}
          {!addressVerified && propertyAddress.trim().length > 4 ? (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-600">{t("pages.newShowing.pickSuggestion")}</p>
              <div className="grid grid-cols-4 gap-2">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("pages.newShowing.city")}
                  className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                />
                <input
                  value={state}
                  onChange={(e) => setStateValue(e.target.value.toUpperCase())}
                  placeholder={t("pages.newShowing.state")}
                  maxLength={2}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                />
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder={t("pages.newShowing.zip")}
                  maxLength={10}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                />
              </div>
            </div>
          ) : null}
          {lookupLoading ? (
            <p className="mt-1.5 text-[11px] text-slate-500">{t("pages.newShowing.lookingUp")}</p>
          ) : null}
          {statusBanner ? (
            <div
              role="status"
              className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                statusBanner.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : statusBanner.tone === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {statusBanner.text}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.time")}</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.duration")}</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min={5}
              max={240}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.mls")}</label>
            <input
              value={mlsNumber}
              onChange={(e) => setMlsNumber(e.target.value)}
              placeholder={t("pages.newShowing.mlsPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.listingUrl")}</label>
            <input
              value={mlsUrl}
              onChange={(e) => {
                setMlsUrl(e.target.value);
                // Reset the detect badge when the field is being
                // edited; we'll re-run detection on blur.
                if (listingUrlDetected) setListingUrlDetected(null);
              }}
              onBlur={(e) => {
                void detectListingUrl(e.target.value);
              }}
              onPaste={(e) => {
                // Run detection immediately on paste (the most common
                // way agents add a Zillow/Redfin link). We need a tick
                // for React to commit the new value before our handler
                // reads it from state.
                const pasted = e.clipboardData.getData("text") ?? "";
                if (pasted.trim()) {
                  setTimeout(() => void detectListingUrl(pasted.trim()), 0);
                }
              }}
              placeholder={t("pages.newShowing.urlPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {listingUrlDetected && (
              <div className="mt-1 text-[11px]">
                {listingUrlDetected.status === "looking-up" && (
                  <span className="text-slate-500">
                    🔍 {t("pages.listingLookup.detected", { label: listingUrlDetected.label })}
                  </span>
                )}
                {listingUrlDetected.status === "filled" && (
                  <span className="text-emerald-700">
                    {t("pages.newShowing.detected", { label: listingUrlDetected.label })}{" "}
                    {listingUrlDetected.note}
                  </span>
                )}
                {listingUrlDetected.status === "address-only" && (
                  <span className="text-slate-500">
                    {t("pages.newShowing.detectedPlain", { label: listingUrlDetected.label })}{" "}
                    {listingUrlDetected.note}
                  </span>
                )}
                {listingUrlDetected.status === "failed" && (
                  <span className="text-amber-700">
                    {listingUrlDetected.label} {t("pages.dashFragments.detectedBut")}{" "}
                    {listingUrlDetected.note?.toLowerCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.accessNotes")}</label>
          <input
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            placeholder={t("pages.newShowing.accessPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.newShowing.copyFromShowingTime")}</p>
        </div>

        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-700">{t("pages.newShowing.listingAgent")}</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500">{t("pages.newShowing.name")}</label>
              <input
                value={listingAgentName}
                onChange={(e) => setListingAgentName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500">{t("pages.newShowing.email")}</label>
              <input
                type="email"
                value={listingAgentEmail}
                onChange={(e) => setListingAgentEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500">{t("pages.newShowing.phone")}</label>
              <input
                value={listingAgentPhone}
                onChange={(e) => setListingAgentPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newShowing.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href="/dashboard/showings"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >{t("pages.newShowing.cancel")}</Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !contact?.id || !propertyAddress.trim() || !scheduledAtIso}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? t("pages.newShowing.scheduling") : t("pages.newShowing.schedule")}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultDateIso(): string {
  // Today in the user's locale. date inputs want YYYY-MM-DD.
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function NewShowingClient() {
  const { t } = useTranslation("dashboard");
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">{t("pages.newShowing.loading")}</div>}>
      <NewShowingForm />
    </Suspense>
  );
}

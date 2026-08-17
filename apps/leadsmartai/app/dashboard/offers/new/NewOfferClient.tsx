"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AddressAutocomplete, {
  type AddressAutocompleteValue,
} from "@/components/AddressAutocomplete";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";
import {
  detectPlatform,
  platformLabel,
  type ListingPlatform,
} from "@/lib/listingUrl";
import type { FinancingType } from "@/lib/offers/types";

/** Pull a string field from the from-listing API's loosely-typed
 *  `data` blob. Same helper the showings form uses — checks several
 *  naming variants since the upstream listing source isn't strict. */
function readBlobString(blob: unknown, ...keys: string[]): string | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Same idea as readBlobString but for numeric fields (list_price). */
function readBlobNumber(blob: unknown, ...keys: string[]): number | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

type ListingDetectState =
  | { platform: ListingPlatform; label: string; status: "looking-up"; note?: string }
  | { platform: ListingPlatform; label: string; status: "filled"; note: string }
  | { platform: ListingPlatform; label: string; status: "address-only"; note: string }
  | { platform: ListingPlatform; label: string; status: "failed"; note: string };

/**
 * Create a new offer. Accepts:
 *   ?contactId=<uuid>   — deep-link prefill for the buyer
 *   ?showingId=<uuid>   — back-link AND prefill source. We fetch the
 *                         showing on mount and seed property_address /
 *                         city / state / zip from it. Best-effort: also
 *                         pulls list_price from the property warehouse
 *                         when one is cached. Agent can still edit
 *                         everything before submitting (e.g. if the
 *                         buyer is offering on a different unit or the
 *                         list price has changed).
 *
 * Default: creates as `draft`. The "Submit now" checkbox flips to
 * `submitted` + stamps submitted_at in the same request.
 */

function NewOfferForm() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams?.get("contactId") ?? "";
  const prefilledShowingId = searchParams?.get("showingId") ?? "";

  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateValue] = useState("CA");
  const [zip, setZip] = useState("");
  /** Pasteable listing URL — when set, triggers /api/property/from-listing
   *  to extract address + price + MLS#. Stored on the offer as mls_url
   *  so the offer detail page can deep-link back to the source listing. */
  const [listingUrl, setListingUrl] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");
  const [listingUrlDetected, setListingUrlDetected] =
    useState<ListingDetectState | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [earnestMoney, setEarnestMoney] = useState("");
  const [downPayment, setDownPayment] = useState("");
  // Percentage chips ("3%", "20%") let agents pick standard
  // earnest/down ratios and have the dollar amounts auto-fill from
  // the current offer price. null = "custom" (agent typed a manual
  // dollar value, so we leave it alone). Defaults: 3% earnest is
  // the typical CA EMD baseline; 20% down maps to a conventional
  // 80% LTV loan, which covers most cases the agent ships.
  const [earnestPct, setEarnestPct] = useState<number | null>(0.03);
  const [downPct, setDownPct] = useState<number | null>(0.2);
  const [financingType, setFinancingType] = useState<FinancingType | "">("");
  const [closingDateProposed, setClosingDateProposed] = useState("");
  const [offerExpiresAt, setOfferExpiresAt] = useState("");
  const [inspectionContingency, setInspectionContingency] = useState(true);
  const [appraisalContingency, setAppraisalContingency] = useState(true);
  const [loanContingency, setLoanContingency] = useState(true);
  const [contingencyNotes, setContingencyNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [submitNow, setSubmitNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Surfaces "Loaded from showing" / "Loading…" hint under the address field
   *  when we're prefilling from ?showingId. Also reused for the
   *  AddressAutocomplete-driven warehouse fetch ("Loaded list price from
   *  records — $749,000"). */
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  /**
   * AbortControllers for the in-flight warehouse + listing-URL
   * fetches. Without these, a fast agent who pastes a Zillow URL
   * and immediately picks a Google address (or types two URLs back
   * to back) gets last-write-wins via response timing — which can
   * leave stale fields populated from the earlier fetch. We abort
   * the previous fetch when a new one starts so only the most
   * recent intent wins.
   */
  const warehouseFetchRef = useRef<AbortController | null>(null);
  const listingFetchRef = useRef<AbortController | null>(null);

  /**
   * Best-effort fetch of list_price (or estimated value) from the
   * property warehouse for a given address. Used in two places:
   *
   *   1. The ?showingId prefill effect — fills list_price after
   *      the showing's address is known.
   *   2. The AddressAutocomplete onSelect — fills list_price the
   *      moment an agent picks a verified address from Google
   *      autocomplete, even without a source showing.
   *
   * Bails when address is empty. Skips overwriting if the agent
   * already typed a list price. Sets a small "Loaded list price
   * from records" hint under the address so the prefill is
   * visible to the user.
   */
  async function applyListPriceFromWarehouse(addr: string): Promise<void> {
    if (!addr) return;
    // Abort any in-flight warehouse fetch so a stale response can't
    // overwrite values from a newer pick.
    warehouseFetchRef.current?.abort();
    const controller = new AbortController();
    warehouseFetchRef.current = controller;
    try {
      const res = await fetch(
        `/api/property/${encodeURIComponent(addr)}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!res.ok) {
        // Clear the "Loading…" hint we set in the AddressAutocomplete
        // onSelect — leaving it stuck is worse than no hint at all.
        setPrefillNote(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        latest_snapshot?: { estimated_value?: number | null } | null;
        property?: { last_list_price?: number | null } | null;
      };
      if (controller.signal.aborted) return;
      const cachedPrice =
        body?.property?.last_list_price ??
        body?.latest_snapshot?.estimated_value ??
        null;
      if (cachedPrice == null) {
        setPrefillNote(null);
        return;
      }
      let updated = false;
      setListPrice((cur) => {
        if (cur) return cur;
        updated = true;
        return String(Math.round(cachedPrice));
      });
      setPrefillNote(
        updated
          ? `Loaded list price from records — $${Math.round(cachedPrice).toLocaleString()}`
          : null,
      );
    } catch (e) {
      // AbortError is expected when a newer fetch supersedes us — no
      // need to clear notes since the new fetch will manage them.
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      // Silent on real network errors. Clear any "Loading…" hint so
      // the agent isn't stuck on it.
      setPrefillNote(null);
    }
  }

  /**
   * Listing-URL autodetect.
   *
   * Triggered when the agent pastes/edits the "Listing URL" field. If
   * the URL is from a recognized platform (Zillow, Redfin, Realtor,
   * Compass), we hit /api/property/from-listing which:
   *
   *   - Scrapes the JSON-LD for address + price (Zillow's clean side)
   *   - Hits Rentcast for the MLS-authoritative status + MLS#
   *   - Merges the two and writes a property warehouse row
   *
   * Auto-fills empty form fields only — never overwrites a value the
   * agent has already typed. Same conservative pattern as the
   * showings form. The URL itself is stored as mls_url on submit so
   * the offer detail page can deep-link back to the listing.
   *
   * Non-fatal: a fetch failure or unrecognized URL leaves the URL
   * value as plain text and falls through to manual entry.
   */
  async function detectListingUrl(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) {
      // Cancel any in-flight detect when the field is cleared so a
      // late response can't repopulate after the user erased the URL.
      listingFetchRef.current?.abort();
      setListingUrlDetected(null);
      return;
    }
    const platform = detectPlatform(url);
    if (!platform) {
      listingFetchRef.current?.abort();
      setListingUrlDetected(null);
      return;
    }
    const label = platformLabel(platform);
    setListingUrlDetected({ platform, label, status: "looking-up" });

    // Abort any in-flight listing-URL fetch so the latest URL wins.
    listingFetchRef.current?.abort();
    const controller = new AbortController();
    listingFetchRef.current = controller;

    try {
      const res = await fetch(
        `/api/property/from-listing?url=${encodeURIComponent(url)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        platform?: string;
        address?: string | null;
        data?: unknown;
        error?: string;
      };
      if (controller.signal.aborted) return;
      if (!res.ok || !body.ok || !body.address) {
        setListingUrlDetected({
          platform,
          label,
          status: "failed",
          note: body.error ?? "Couldn't extract listing details.",
        });
        return;
      }

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
        // "CA" is the form's default — overwrite only when the URL
        // carries a different state, mirroring the showings form.
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
      const blobPrice = readBlobNumber(
        blob,
        "list_price",
        "listPrice",
        "price",
        "listing_price",
      );
      if (blobPrice != null) {
        let priceFilled = false;
        setListPrice((cur) => {
          if (cur) return cur;
          priceFilled = true;
          return String(Math.round(blobPrice));
        });
        if (priceFilled) filledAnything = true;
      }

      setListingUrlDetected({
        platform,
        label,
        status: filledAnything ? "filled" : "address-only",
        note: filledAnything
          ? `Auto-filled from ${label}.`
          : `Listing parsed but the form is already filled — leaving values alone.`,
      });
    } catch (e) {
      // AbortError fires when a newer fetch supersedes us — silent
      // because the new fetch will own the badge state.
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      setListingUrlDetected({
        platform,
        label,
        status: "failed",
        note: e instanceof Error ? e.message : "Network error.",
      });
    }
  }

  // Prefill property fields from the linked showing when ?showingId
  // is present. Three tiers, each strictly best-effort:
  //
  //   1. Showing API → address / city / state / zip / mls_number /
  //      mls_url (always works when the showing exists; one DB row).
  //
  //   2. Listing-URL autodetect: if the showing carries a recognized
  //      mls_url (Zillow / Redfin / Realtor / Compass), kick the
  //      detect helper so the from-listing scrape + Rentcast merge
  //      fills price / address / MLS# from the source listing. This
  //      is the path that makes "all property info populated" work
  //      on the New offer form when arriving from a showing.
  //
  //   3. Property warehouse → list_price (cached for anything we've
  //      shown before; quick win when the listing URL isn't a
  //      supported platform OR the scrape returns nothing).
  //
  // Runs once per mount. Won't clobber user edits because every
  // setter bails when the field is already populated.
  useEffect(() => {
    if (!prefilledShowingId) return;
    let cancelled = false;
    setPrefillNote("Loading from showing…");

    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/showings/${encodeURIComponent(prefilledShowingId)}`,
          { cache: "no-store" },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          showing?: {
            property_address?: string | null;
            city?: string | null;
            state?: string | null;
            zip?: string | null;
            mls_number?: string | null;
            mls_url?: string | null;
          };
        };
        if (cancelled) return;
        const sh = body?.showing;
        if (!res.ok || !body.ok || !sh?.property_address) {
          setPrefillNote(null);
          return;
        }

        // Address + MLS fields — only seed if the user hasn't
        // already typed something.
        setPropertyAddress((cur) => cur || sh.property_address || "");
        if (sh.city) setCity((cur) => cur || sh.city || "");
        if (sh.state) setStateValue((cur) => cur || sh.state || "");
        if (sh.zip) setZip((cur) => cur || sh.zip || "");
        if (sh.mls_number) setMlsNumber((cur) => cur || sh.mls_number || "");

        // The Listing URL — if the showing has a recognized listing
        // platform URL, populate the field AND trigger the detect
        // helper. The detect helper does all the heavy lifting:
        // hits /api/property/from-listing, merges scrape + Rentcast,
        // fills list_price + MLS# + address normalization. That's
        // what makes "all property info populated" actually true.
        const showingUrl = sh.mls_url ?? null;
        if (showingUrl && !listingUrl) {
          setListingUrl(showingUrl);
          if (detectPlatform(showingUrl)) {
            // Fire detect in the background; it has its own error
            // handling + abort controller so it can race safely
            // with the warehouse fetch below.
            void detectListingUrl(showingUrl);
          }
        }

        setPrefillNote(`Prefilled from showing — ${sh.property_address}`);

        // Tier-3: list price from the warehouse. Non-blocking; the
        // helper handles its own errors and bails if the agent has
        // already typed a list price OR the detect helper above
        // populated it first (its setter uses cur || ...).
        if (!cancelled) await applyListPriceFromWarehouse(sh.property_address);
      } catch {
        if (!cancelled) setPrefillNote(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledShowingId]);

  // Auto-compute earnest money / down payment from a "base price" ×
  // selected percentage chip. Base = offerPrice when the agent has
  // typed one, else listPrice (which prefills from the warehouse on
  // mount). The fallback is what makes the chips feel responsive on
  // first load — without it the chips would appear selected but the
  // dollar fields would stay blank until the agent types an offer,
  // and clicking a chip would seem to "do nothing."
  //
  // Bails when neither price is numeric/positive. Bails when the
  // chip is null (= "custom", agent typed a manual dollar value)
  // so we don't clobber their typed amount.
  //
  // No setEarnestMoney → setEarnestPct loop: the chip setter is the
  // only thing that mutates earnestPct, and the dollar input's
  // onChange clears earnestPct to null on manual edits.
  function pickBasePrice(): number | null {
    const offerNum = Number(offerPrice);
    if (Number.isFinite(offerNum) && offerNum > 0) return offerNum;
    const listNum = Number(listPrice);
    if (Number.isFinite(listNum) && listNum > 0) return listNum;
    return null;
  }

  useEffect(() => {
    const base = pickBasePrice();
    if (base == null) return;
    if (earnestPct != null) setEarnestMoney(String(Math.round(base * earnestPct)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerPrice, listPrice, earnestPct]);

  useEffect(() => {
    const base = pickBasePrice();
    if (base == null) return;
    if (downPct != null) setDownPayment(String(Math.round(base * downPct)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerPrice, listPrice, downPct]);

  async function submit() {
    setError(null);
    if (!contact?.id || !propertyAddress.trim() || !offerPrice.trim()) {
      setError(t("pages.newOffer.errRequired"));
      return;
    }
    const priceNum = Number(offerPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError(t("pages.newOffer.errPrice"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          showingId: prefilledShowingId || null,
          propertyAddress: propertyAddress.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          // Stored on the offer so the detail page can deep-link
          // back to the source listing + show the MLS#. Only persist
          // the URL if it's a recognized real-estate listing platform
          // — otherwise random text the agent typed (or pasted from
          // the wrong app) ends up rendered as a broken link on the
          // detail page.
          mlsUrl:
            listingUrl.trim() && detectPlatform(listingUrl.trim())
              ? listingUrl.trim()
              : null,
          mlsNumber: mlsNumber.trim() || null,
          listPrice: listPrice ? Number(listPrice) : null,
          offerPrice: priceNum,
          earnestMoney: earnestMoney ? Number(earnestMoney) : null,
          downPayment: downPayment ? Number(downPayment) : null,
          financingType: financingType || null,
          closingDateProposed: closingDateProposed || null,
          offerExpiresAt: offerExpiresAt ? new Date(offerExpiresAt).toISOString() : null,
          inspectionContingency,
          appraisalContingency,
          loanContingency,
          contingencyNotes: contingencyNotes.trim() || null,
          notes: notes.trim() || null,
          submitNow,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        offer?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.offer) {
        setError(body.error ?? "Failed to create offer.");
        return;
      }
      router.push(`/dashboard/offers/${body.offer.id}`);
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
          <Link href="/dashboard/offers" className="hover:underline">{t("pages.newOffer.offers")}</Link>
          {" / New"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.newOffer.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.newOffer.sub")}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.buyer")}</label>
          <ContactPicker
            value={contact}
            onChange={setContact}
            initialContactId={prefilledContactId || null}
            helperText="Start typing the buyer's name, email, or phone."
            className="mt-1"
          />
        </div>

        {/* Listing URL — paste a Zillow / Redfin / Realtor / Compass
            link and the form auto-fills address + city/state/zip +
            list price + MLS #. The URL is stored as mls_url on the
            offer so the detail page can deep-link back. Optional — a
            blank URL just leaves the rest of the form to manual entry. */}
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.listingUrl")}<span className="font-normal text-slate-400">{t("pages.newOffer.optional")}</span>
          </label>
          <input
            type="url"
            value={listingUrl}
            onChange={(e) => {
              setListingUrl(e.target.value);
              void detectListingUrl(e.target.value);
            }}
            placeholder={t("pages.newOffer.urlPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {listingUrlDetected ? (
            <div
              className={
                listingUrlDetected.status === "looking-up"
                  ? "mt-1.5 text-[11px] text-slate-500"
                  : listingUrlDetected.status === "filled"
                    ? "mt-1.5 text-[11px] text-emerald-700"
                    : listingUrlDetected.status === "address-only"
                      ? "mt-1.5 text-[11px] text-slate-500"
                      : "mt-1.5 text-[11px] text-amber-700"
              }
            >
              {listingUrlDetected.status === "looking-up"
                ? `${listingUrlDetected.label} detected · looking up details…`
                : `${listingUrlDetected.label} · ${listingUrlDetected.note}`}
            </div>
          ) : null}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.address")}</label>

          {/* Recent-addresses quick-pick was removed once the
              ?showingId prefill landed — that path covers the
              common case (offering on the property just shown)
              and the Recent list became redundant noise on top
              of an already-filled form. AddressAutocomplete below
              still handles the "different property" edge case. */}

          <AddressAutocomplete
            value={propertyAddress}
            onChange={setPropertyAddress}
            onSelect={(val: AddressAutocompleteValue) => {
              setPropertyAddress(val.formattedAddress);
              if (val.components.city) setCity(val.components.city);
              if (val.components.state) setStateValue(val.components.state);
              if (val.components.zip) setZip(val.components.zip);
              // Pull list price from the property warehouse for the
              // address the agent just verified. Without this, list
              // price stays empty and the % chips have nothing to
              // compute against until the agent types an offer.
              setPrefillNote("Loading list price from records…");
              void applyListPriceFromWarehouse(val.formattedAddress);
            }}
            placeholder={t("pages.newOffer.addressHint")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {(city || state || zip) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              {city ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{city}</span> : null}
              {state ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{state}</span> : null}
              {zip ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{zip}</span> : null}
            </div>
          ) : null}
          {prefillNote ? (
            <div className="mt-1.5 text-[11px] text-emerald-700">{prefillNote}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.listPrice")}</label>
            <input
              type="number"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.offerPrice")}</label>
            <input
              type="number"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.earnestMoney")}</label>
            <input
              type="number"
              value={earnestMoney}
              // Manual edit clears the chip selection so the
              // auto-calc effect won't overwrite the typed value
              // when the agent next adjusts offer price.
              onChange={(e) => {
                setEarnestMoney(e.target.value);
                setEarnestPct(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <PctChips
              value={earnestPct}
              options={[0.01, 0.02, 0.03, 0.05]}
              onChange={setEarnestPct}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.downPayment")}</label>
            <input
              type="number"
              value={downPayment}
              onChange={(e) => {
                setDownPayment(e.target.value);
                setDownPct(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <PctChips
              value={downPct}
              options={[0.05, 0.1, 0.2, 0.25, 1]}
              onChange={setDownPct}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.financing")}</label>
            <select
              value={financingType}
              onChange={(e) => setFinancingType(e.target.value as FinancingType | "")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="cash">{t("pages.newOffer.cash")}</option>
              <option value="conventional">{t("pages.newOffer.conventional")}</option>
              <option value="fha">{t("pages.newOffer.fha")}</option>
              <option value="va">VA</option>
              <option value="jumbo">{t("pages.newOffer.jumbo")}</option>
              <option value="other">{t("pages.newOffer.other")}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.proposedClosing")}</label>
            <input
              type="date"
              value={closingDateProposed}
              onChange={(e) => setClosingDateProposed(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.offerExpires")}</label>
            <input
              type="datetime-local"
              value={offerExpiresAt}
              onChange={(e) => setOfferExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-700">{t("pages.newOffer.contingencies")}</div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={inspectionContingency}
                onChange={(e) => setInspectionContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newOffer.inspection")}</label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={appraisalContingency}
                onChange={(e) => setAppraisalContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newOffer.appraisal")}</label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={loanContingency}
                onChange={(e) => setLoanContingency(e.target.checked)}
                className="h-4 w-4"
              />{t("pages.newOffer.loan")}</label>
          </div>
          <input
            value={contingencyNotes}
            onChange={(e) => setContingencyNotes(e.target.value)}
            placeholder={t("pages.newOffer.otherContingencies")}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.newOffer.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={submitNow}
            onChange={(e) => setSubmitNow(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium text-slate-800">{t("pages.newOffer.alreadySubmitted")}</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">{t("pages.newOffer.skipsDraft")}</span>
          </span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href="/dashboard/offers"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >{t("pages.newOffer.cancel")}</Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !contact?.id || !propertyAddress.trim() || !offerPrice.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : submitNow ? t("pages.newOffer.createSubmit") : t("pages.newOffer.createDraft")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline % chips under the earnest-money / down-payment fields.
 * Click a chip to set the dollar amount = offer × pct. Click the
 * active chip again to deselect (= "custom" / manual entry).
 *
 * Renders compact 10px buttons so the chip row fits inside the
 * 3-column grid on desktop without wrapping. Special-cases 100%
 * → "Cash" since "100%" reads as redundant for the all-cash case.
 */
function PctChips({
  value,
  options,
  onChange,
}: {
  value: number | null;
  options: number[];
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {options.map((pct) => {
        const active = value === pct;
        const label = pct === 1 ? "Cash" : `${Math.round(pct * 100)}%`;
        return (
          <button
            key={pct}
            type="button"
            onClick={() => onChange(active ? null : pct)}
            className={
              active
                ? "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
            }
            aria-pressed={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function NewOfferClient() {
  const { t } = useTranslation("dashboard");
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">{t("pages.newOffer.loading")}</div>}>
      <NewOfferForm />
    </Suspense>
  );
}

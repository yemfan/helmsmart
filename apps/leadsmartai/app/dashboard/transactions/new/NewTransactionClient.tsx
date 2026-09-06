"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AddressAutocomplete, {
  type AddressAutocompleteValue,
} from "@/components/AddressAutocomplete";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";
import PropertyLookupField, {
  type PropertyLookupResult,
} from "@/components/dashboard/PropertyLookupField";
import { ContractUploader, type RlaUploadResult, type RpaUploadResult } from "./ContractUploader";

/**
 * New-transaction form. Buyer-side or listing-side, both supported.
 *
 * On listing-rep deals, `listing_start_date` is the anchor for pre-list +
 * marketing tasks; `mutual_acceptance_date` becomes the anchor for
 * post-offer tasks once the seller accepts.
 *
 * Accepts `?contactId=<uuid>` as a deep-link prefill — ContactPicker
 * resolves the display name once on mount.
 */
type TxType = "buyer_rep" | "listing_rep" | "dual";

function NewTransactionForm() {
  const { t: tr } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams?.get("contactId") ?? "";
  /** ?offerId=<uuid> — agent clicked ✓ Accept on /dashboard/offers and
   *  was routed here. We fetch the offer and prefill buyer + address +
   *  price + dates so the agent only needs to confirm + upload the
   *  signed RPA via the ContractUploader. The id is also POSTed back
   *  with the create request so the API can set offer.transaction_id. */
  const prefilledOfferId = searchParams?.get("offerId") ?? "";

  // Honor `?type=listing_rep` (or `dual`) so the Listings page button
  // — and CommandPalette deep links — open the form already on the
  // listing-side track. Default stays buyer_rep when no type passed.
  //
  // Side effect: when the URL explicitly pins a type (i.e. the agent
  // arrived via "+ New listing" rather than the generic "+ New
  // transaction"), the deal-type selector is hidden — the entry
  // point IS the deal type. Showing a Buyer side / Listing side /
  // Dual agent toggle on a form titled "New listing" reads as a
  // mistake — it's a listing, not a transaction-with-listing-mode.
  const typeParam = searchParams?.get("type") ?? null;
  /** ?listingId — when present, the agent arrived from a listing
   *  detail page after accepting a listing-side offer. The form
   *  prefills buyer/address/price/dates from the listing + the
   *  accepted offer (?listingOfferId), and the submit handler
   *  back-links the new transaction to both. Pin transactionType
   *  to listing_rep on this path. */
  const prefilledListingId = searchParams?.get("listingId") ?? "";
  const prefilledListingOfferId = searchParams?.get("listingOfferId") ?? "";
  const fromListing = !!prefilledListingId;
  const typePinnedFromUrl =
    typeParam === "listing_rep" || typeParam === "dual" || fromListing;
  const initialType: TxType = fromListing
    ? "listing_rep"
    : typePinnedFromUrl
      ? (typeParam as TxType)
      : "buyer_rep";
  const focusUpload = searchParams?.get("focus") === "upload";

  const [transactionType, setTransactionType] = useState<TxType>(initialType);
  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [contactInitialId, setContactInitialId] = useState<string | null>(
    prefilledContactId || null,
  );
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateValue] = useState("CA");
  const [zip, setZip] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [listingStartDate, setListingStartDate] = useState("");
  const [mutualAcceptanceDate, setMutualAcceptanceDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Banner shown when this form was opened from an accepted offer.
   *  Surfaces the source address so the agent knows where the
   *  prefilled data came from. */
  const [offerBanner, setOfferBanner] = useState<string | null>(null);
  /** Small grey hint under the address field — used by the
   *  warehouse-fetch helper to surface "Loaded list price from
   *  records — $749,000" after the agent picks a verified address. */
  const [addressNote, setAddressNote] = useState<string | null>(null);
  /** AbortController for the in-flight warehouse lookup so two
   *  rapid Google picks can't race and clobber each other's
   *  results. Same pattern the offers form uses. */
  const warehouseFetchRef = useRef<AbortController | null>(null);

  const isListing = transactionType === "listing_rep";

  /**
   * Best-effort fetch of list_price from the property warehouse for
   * a given address. Triggered when the agent picks a verified
   * address from Google autocomplete. Bails when address is empty;
   * never overwrites an already-typed list price (`cur || ...`
   * pattern); silent on warehouse misses or network errors. Same
   * helper shape as the one in NewOfferClient.
   */
  async function applyListPriceFromWarehouse(addr: string): Promise<void> {
    if (!addr) return;
    warehouseFetchRef.current?.abort();
    const controller = new AbortController();
    warehouseFetchRef.current = controller;
    try {
      const res = await fetch(
        `/api/property/${encodeURIComponent(addr)}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (controller.signal.aborted || !res.ok) {
        if (!controller.signal.aborted) setAddressNote(null);
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
        setAddressNote(null);
        return;
      }
      let updated = false;
      setPurchasePrice((cur) => {
        if (cur) return cur;
        updated = true;
        return String(Math.round(cachedPrice));
      });
      setAddressNote(
        updated
          ? `Loaded ${isListing ? "list price" : "purchase price"} from records — $${Math.round(cachedPrice).toLocaleString()}`
          : null,
      );
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      setAddressNote(null);
    }
  }

  /**
   * Prefill from an accepted offer when the form was opened via
   * /dashboard/transactions/new?offerId=<id>. Maps:
   *   offer.contact_id   → buyer (ContactPicker.value)
   *   offer.property_*   → address fields
   *   offer.current_price ?? offer.offer_price → purchase price
   *   offer.accepted_at slice → mutual acceptance date
   *   offer.closing_date_proposed → closing date
   *   offer.notes        → notes
   *
   * Forces transaction_type to buyer_rep — this flow only triggers
   * when an agent accepts an offer they wrote on a buyer's behalf.
   * Skips silently if the fetch fails so the empty form still works.
   */
  useEffect(() => {
    if (!prefilledOfferId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/offers/${encodeURIComponent(prefilledOfferId)}`,
          { cache: "no-store" },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          offer?: {
            contact_id: string;
            property_address: string;
            city: string | null;
            state: string | null;
            zip: string | null;
            offer_price: number;
            current_price: number | null;
            accepted_at: string | null;
            closing_date_proposed: string | null;
            notes: string | null;
          };
          contactName?: string | null;
        };
        if (cancelled || !res.ok || !body.ok || !body.offer) return;
        const o = body.offer;

        setTransactionType("buyer_rep");
        setContact({
          id: o.contact_id,
          name: body.contactName ?? "Buyer",
        });
        setContactInitialId(o.contact_id);
        if (o.property_address) setPropertyAddress(o.property_address);
        if (o.city) setCity(o.city);
        if (o.state) setStateValue(o.state);
        if (o.zip) setZip(o.zip);
        const price = o.current_price ?? o.offer_price;
        if (price != null) setPurchasePrice(String(Math.round(price)));
        if (o.accepted_at) setMutualAcceptanceDate(o.accepted_at.slice(0, 10));
        if (o.closing_date_proposed) setClosingDate(o.closing_date_proposed);
        if (o.notes) setNotes(o.notes);
        setOfferBanner(`Creating transaction from accepted offer — ${o.property_address}`);
      } catch {
        // Empty form is a fine fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefilledOfferId]);

  /**
   * Listing-side prefill: when ?listingId is present (the agent
   * accepted a listing-side offer and was routed here from the
   * listing detail page), fetch the listing + the accepted offer
   * and seed the form. Mirrors the ?offerId path conceptually but
   * pulls from a different pair of tables.
   *
   * Maps:
   *   listing.contact_id        → seller (ContactPicker.value)
   *   listing.property_*        → address fields
   *   listing.listing_start_date → listing_start_date
   *   listingOffer.current_price ?? .offer_price → purchase_price
   *   listingOffer.accepted_at slice → mutual_acceptance_date
   *   listingOffer.closing_date_proposed → closing_date
   *
   * Both ids are POSTed back on submit so the API can write
   * source_listing_id on the new transaction + listing.transaction_id
   * back-link + (eventually) listing_offer.transaction_id link.
   */
  useEffect(() => {
    if (!prefilledListingId) return;
    let cancelled = false;
    (async () => {
      try {
        const listingRes = await fetch(
          `/api/dashboard/listings/${encodeURIComponent(prefilledListingId)}`,
          { cache: "no-store" },
        );
        const listingBody = (await listingRes.json().catch(() => ({}))) as {
          ok?: boolean;
          listing?: {
            contact_id: string;
            contactName?: string | null;
            property_address: string;
            city: string | null;
            state: string | null;
            zip: string | null;
            list_price: number | null;
            listing_start_date: string | null;
          };
        };
        if (cancelled || !listingRes.ok || !listingBody.ok || !listingBody.listing) return;
        const l = listingBody.listing;

        setTransactionType("listing_rep");
        setContact({
          id: l.contact_id,
          name: l.contactName ?? "Seller",
        });
        setContactInitialId(l.contact_id);
        if (l.property_address) setPropertyAddress(l.property_address);
        if (l.city) setCity(l.city);
        if (l.state) setStateValue(l.state);
        if (l.zip) setZip(l.zip);
        if (l.list_price != null) setPurchasePrice(String(Math.round(l.list_price)));
        if (l.listing_start_date) setListingStartDate(l.listing_start_date);
        setOfferBanner(`Marking ${l.property_address} under contract`);

        // If we have the accepted offer's id, fetch it for the
        // negotiated price + dates (listingOffer.current_price
        // beats listing.list_price; .closing_date_proposed beats
        // a hand-typed default).
        if (prefilledListingOfferId && !cancelled) {
          const offerRes = await fetch(
            `/api/dashboard/listing-offers/${encodeURIComponent(prefilledListingOfferId)}`,
            { cache: "no-store" },
          );
          const offerBody = (await offerRes.json().catch(() => ({}))) as {
            ok?: boolean;
            offer?: {
              offer_price: number;
              current_price: number | null;
              accepted_at: string | null;
              closing_date_proposed: string | null;
            };
          };
          if (cancelled || !offerRes.ok || !offerBody.ok || !offerBody.offer) return;
          const o = offerBody.offer;
          const price = o.current_price ?? o.offer_price;
          if (price != null) setPurchasePrice(String(Math.round(price)));
          if (o.accepted_at) setMutualAcceptanceDate(o.accepted_at.slice(0, 10));
          if (o.closing_date_proposed) setClosingDate(o.closing_date_proposed);
        }
      } catch {
        // Empty form is a fine fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledListingId, prefilledListingOfferId]);

  /**
   * When the agent arrives via the Listings page "Upload listing
   * agreement" button (`?focus=upload`), scroll the contract uploader
   * into view and briefly ring it so it's obviously the next action.
   * Skipped if focus param is absent — keeps the default open-the-form
   * UX intact for everyone else.
   */
  const uploaderRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusUpload) return;
    const el = uploaderRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-blue-400", "ring-offset-2", "rounded-2xl");
    const timer = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-blue-400", "ring-offset-2", "rounded-2xl");
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusUpload]);

  async function submit() {
    setError(null);
    if (!contact?.id || !propertyAddress.trim()) {
      setError(tr("pages.newTransaction.errRequired"));
      return;
    }
    setSubmitting(true);
    try {
      // Phase 2c of the listings/transactions split: listing-rep
      // submits go through POST /api/dashboard/listings and land
      // on /dashboard/listings/[id]. Buyer-rep + dual still post
      // to /api/dashboard/transactions (the dual case may also
      // get a listing row in Phase 2d's lifecycle promotion at
      // offer-accept, but the agent's primary intent here is the
      // post-acceptance transaction).
      // Listing-rep submit branches on whether the form was opened
      // from an accepted offer (?listingId) or as a fresh listing.
      // Fresh listing → POST /api/dashboard/listings (no transaction
      // spawned). Already-contracted listing → POST /transactions
      // with back-link params so the new transaction is properly
      // linked to the source listing + offer.
      if (transactionType === "listing_rep" && !prefilledListingId) {
        const res = await fetch("/api/dashboard/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contactId: contact.id,
            propertyAddress: propertyAddress.trim(),
            city: city.trim() || null,
            state: state.trim() || null,
            zip: zip.trim() || null,
            listPrice: purchasePrice ? Number(purchasePrice) : null,
            listingStartDate: listingStartDate || null,
            // closingDate and mutualAcceptanceDate intentionally
            // dropped — listings carry no closing fields in the
            // new model. They get set on the spawned transaction
            // when an offer is accepted.
            notes: notes.trim() || null,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          listing?: { id: string };
          error?: string;
        };
        if (!res.ok || !body.ok || !body.listing) {
          setError(body.error ?? "Failed to create listing.");
          return;
        }
        router.push(`/dashboard/listings/${body.listing.id}`);
        return;
      }

      const res = await fetch("/api/dashboard/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          transactionType,
          propertyAddress: propertyAddress.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          listingStartDate: listingStartDate || null,
          mutualAcceptanceDate: mutualAcceptanceDate || null,
          closingDate: closingDate || null,
          notes: notes.trim() || null,
          // When this form was opened via ?offerId, send it back so
          // the API can set offer.transaction_id for the back-link.
          offerId: prefilledOfferId || null,
          // When this form was opened via ?listingId (accepted
          // listing-side offer flow), send back so the API can
          // set transactions.source_listing_id +
          // listings.transaction_id (forward + back link), and
          // optionally listing_offers.transaction_id for the
          // accepted offer.
          listingId: prefilledListingId || null,
          listingOfferId: prefilledListingOfferId || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transaction?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.transaction) {
        setError(body.error ?? "Failed to create transaction.");
        return;
      }
      router.push(`/dashboard/transactions/${body.transaction.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  function applyRpaExtraction(ext: RpaUploadResult) {
    // Buyer/seller name from the extraction is informational only — the
    // agent still has to pick the existing contact in their CRM. We don't
    // auto-match by name; too much risk of picking the wrong John Smith.
    if (ext.propertyAddress) setPropertyAddress(ext.propertyAddress);
    if (ext.city) setCity(ext.city);
    if (ext.state) setStateValue(ext.state);
    if (ext.zip) setZip(ext.zip);
    if (ext.purchasePrice != null) setPurchasePrice(String(ext.purchasePrice));
    if (ext.mutualAcceptanceDate) setMutualAcceptanceDate(ext.mutualAcceptanceDate);
    if (ext.closingDate) setClosingDate(ext.closingDate);
  }

  /**
   * Fill from a pasted listing link or address.
   *
   * Overwrites, unlike the warehouse price helper that fires quietly off a
   * Google address pick. This one only runs because the agent typed something
   * and pressed Look up — looking up a second property and watching the first
   * one's city stay put would read as broken. The chips under the field show
   * what came back, so an overwrite is never invisible.
   */
  function applyPropertyLookup(res: PropertyLookupResult) {
    if (res.address) setPropertyAddress(res.address);
    if (res.city) setCity(res.city);
    if (res.state) setStateValue(res.state);
    if (res.zip) setZip(res.zip);
    if (res.listPrice != null) setPurchasePrice(String(Math.round(res.listPrice)));
    // The address field's own Google-pick handler owns this note; clear it so
    // a stale "Loading from records…" can't sit under a freshly filled address.
    setAddressNote(null);
  }

  function applyRlaExtraction(ext: RlaUploadResult) {
    if (ext.propertyAddress) setPropertyAddress(ext.propertyAddress);
    if (ext.city) setCity(ext.city);
    if (ext.state) setStateValue(ext.state);
    if (ext.zip) setZip(ext.zip);
    if (ext.listPrice != null) setPurchasePrice(String(ext.listPrice));
    if (ext.listingStartDate) setListingStartDate(ext.listingStartDate);
  }

  // When the agent arrives via /dashboard/properties' "+ New listing"
  // button, the URL carries ?type=listing_rep. The data model is the
  // same (listings live in the transactions table) but the page
  // identity should match the entry point — saying "Transactions /
  // New transaction" after clicking "+ New listing" is needlessly
  // jarring. Adapt the breadcrumb + heading + back link so the page
  // reads as listing-rep when that's the entry path.
  // Three entry-point shapes drive the chrome:
  //   - fromListing  → Marking an existing listing under contract
  //                    (offer accepted, spawning the deal)
  //   - isListing    → Creating a fresh listing
  //   - default      → Creating a buyer-rep / dual transaction
  const breadcrumbHref = fromListing
    ? `/dashboard/listings/${prefilledListingId}`
    : isListing
      ? "/dashboard/properties"
      : "/dashboard/transactions";
  const breadcrumbLabel = fromListing
    ? "Listing"
    : isListing
      ? "Listings"
      : "Transactions";
  const headingText = fromListing
    ? "Mark under contract"
    : isListing
      ? "New listing"
      : "New transaction";
  const submitLabel = fromListing
    ? submitting
      ? "Creating deal…"
      : "Mark under contract"
    : isListing
      ? submitting
        ? "Creating…"
        : "Create listing"
      : submitting
        ? "Creating…"
        : "Create transaction";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href={breadcrumbHref} className="hover:underline">
            {breadcrumbLabel}
          </Link>
          {" / New"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{headingText}</h1>
        <p className="mt-1 text-sm text-slate-500">{tr("pages.dashFragments.seedsA")} {isListing ? "listing-rep" : "buyer-rep"} {tr("pages.dashFragments.checklistAutofills")}</p>
        {offerBanner ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <div className="font-medium">{offerBanner}</div>
            <div className="mt-0.5 text-[11px] text-emerald-700">{tr("pages.newTransaction.prefilledNote")}</div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div ref={uploaderRef}>
          {isListing ? (
            <ContractUploader
              kind="listing"
              onExtracted={applyRlaExtraction}
              disabled={submitting}
            />
          ) : (
            <ContractUploader onExtracted={applyRpaExtraction} disabled={submitting} />
          )}
        </div>

        {/* The PDF drop only helps once a signed agreement exists. Before that
            the agent is usually looking at the listing in another tab, or just
            knows the address — so let them paste either one and fill the same
            fields from it. */}
        <PropertyLookupField onResolved={applyPropertyLookup} disabled={submitting} />

        {/* Deal-type selector hidden when the URL pinned the type
            (e.g. arrived via "+ New listing" → ?type=listing_rep).
            On those entry paths the form represents one specific
            deal type and showing a toggle would muddle that. The
            generic "+ New transaction" entry (no ?type param) still
            shows all three tabs since the agent hasn't committed
            to a side yet. */}
        {!typePinnedFromUrl ? (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.dealType")}</label>
            <div className="mt-1 flex gap-2">
              {(["buyer_rep", "listing_rep", "dual"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTransactionType(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    transactionType === t
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {t === "buyer_rep" ? tr("pages.newTransaction.buyerSide") : t === "listing_rep" ? tr("pages.newTransaction.listingSide") : tr("pages.newTransaction.dualAgent")}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            {isListing ? tr("pages.newTransaction.seller") : tr("pages.newTransaction.buyer")}
          </label>
          <ContactPicker
            // Re-key when contactInitialId changes so the picker
            // re-runs its name-resolve effect — important for the
            // ?offerId path where we discover the contact id after
            // the initial mount.
            key={contactInitialId ?? "anonymous"}
            value={contact}
            onChange={setContact}
            initialContactId={contactInitialId}
            helperText={
              isListing
                ? "Start typing the seller's name, email, or phone."
                : "Start typing the buyer's name, email, or phone. Recent contacts show if left blank."
            }
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.address")}</label>
          <AddressAutocomplete
            value={propertyAddress}
            onChange={setPropertyAddress}
            onSelect={(val: AddressAutocompleteValue) => {
              setPropertyAddress(val.formattedAddress);
              if (val.components.city) setCity(val.components.city);
              if (val.components.state) setStateValue(val.components.state);
              if (val.components.zip) setZip(val.components.zip);
              // Same pattern as the offer form: pull list/purchase
              // price from the warehouse for the verified address.
              // Best-effort — silent on misses.
              setAddressNote("Loading from records…");
              void applyListPriceFromWarehouse(val.formattedAddress);
            }}
            placeholder={tr("pages.newTransaction.addressHint")}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
          />
          {addressNote ? (
            <div className="mt-1.5 text-[11px] text-emerald-700">{addressNote}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.city")}</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.state")}</label>
            <input
              value={state}
              onChange={(e) => setStateValue(e.target.value.toUpperCase())}
              maxLength={2}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.zip")}</label>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={10}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {isListing ? tr("pages.newTransaction.listPrice") : tr("pages.newTransaction.purchasePrice")}
            </label>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {isListing && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.listingStart")}</label>
            <input
              type="date"
              value={listingStartDate}
              onChange={(e) => setListingStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">{tr("pages.newTransaction.rlaSigned")}</p>
          </div>
        )}

        {/* Mutual acceptance + closing date are post-acceptance
            fields — they only matter once an offer is accepted and
            the deal is in escrow. Hidden on the new-listing path
            (Phase 2c+) since fresh listings don't carry these
            values; they get set on the transaction spawned via
            "Mark under contract" on the listing detail page (Phase
            2d). Buyer-rep + dual transactions still need them at
            creation time so the deadlines pipeline can fire. */}
        {(!isListing || fromListing) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.mutualAcceptance")}</label>
              <input
                type="date"
                value={mutualAcceptanceDate}
                onChange={(e) => setMutualAcceptanceDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">{tr("pages.newTransaction.anchorsDeadlines")}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.closingDate")}</label>
              <input
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">{tr("pages.newTransaction.autoFills30")}</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{tr("pages.newTransaction.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href={breadcrumbHref}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{tr("pages.newTransaction.cancel")}</Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !contact?.id || !propertyAddress.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewTransactionClient() {
  const { t: tr } = useTranslation("dashboard");
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">{tr("pages.newTransaction.loading")}</div>}>
      <NewTransactionForm />
    </Suspense>
  );
}

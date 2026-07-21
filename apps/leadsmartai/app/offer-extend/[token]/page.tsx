import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isOfferExtendEnabled,
  verifyOfferExtendToken,
} from "@/lib/offer-expirations/extendToken";

export const metadata: Metadata = {
  title: "Extend offer",
  robots: { index: false, follow: false },
};

/**
 * Public one-click extend handler for offer-expiration alert emails.
 * No session auth — the signed token IS the capability.
 *
 * Flow:
 *   1. Verify token (signature + freshness).
 *   2. Look up the offer by (kind, id). If its current `offer_expires_at`
 *      doesn't match `prevExpiresAt` in the token, the token is stale —
 *      the offer has already moved. Reject.
 *   3. Compute new expiration = now + extendHours. Using now (not
 *      old-expiry + extend) keeps behavior predictable if the token is
 *      clicked after a short delay.
 *   4. Update + render a plain confirmation page.
 *
 * This page renders its own simple HTML — the usual dashboard shell
 * would require auth, which we deliberately don't have here.
 */

type PageProps = { params: Promise<{ token: string }> };

type ExtendOutcome =
  | { kind: "ok"; address: string; newExpiresAtIso: string; offerUrl: string }
  | { kind: "error"; title: string; body: string };

export default async function OfferExtendPage({ params }: PageProps) {
  const { token } = await params;
  const outcome = await processExtend(token);
  return <ConfirmationPage outcome={outcome} />;
}

async function processExtend(token: string): Promise<ExtendOutcome> {
  if (!isOfferExtendEnabled()) {
    return {
      kind: "error",
      title: "Link not available",
      body: "Offer-extend links aren't enabled on this environment. Ask your admin to set OFFER_EXTEND_SECRET.",
    };
  }

  const verified = verifyOfferExtendToken(token);
  if (!verified.ok) {
    const reasonMap: Record<string, string> = {
      bad_signature: "This link looks tampered — we can't trust it.",
      malformed: "This link is malformed.",
      expired: "This link is older than 72 hours. Offer-expiration alerts only stay valid for a short window — please take action from the app.",
      payload_invalid: "This link can't be parsed. Try the app instead.",
      disabled: "Offer-extend links aren't enabled on this environment.",
    };
    return {
      kind: "error",
      title: "Link not valid",
      body: reasonMap[verified.error] ?? "This link can't be used.",
    };
  }
  const { payload } = verified;

  const table = payload.kind === "buyer" ? "offers" : "listing_offers";
  const { data: row, error } = await supabaseAdmin
    .from(table)
    .select("id, agent_id, property_address, offer_expires_at, status")
    .eq("id", payload.offerId)
    .eq("agent_id", payload.agentId)
    .maybeSingle();
  if (error || !row) {
    return {
      kind: "error",
      title: "Offer not found",
      body: "We couldn't find the offer this link points at. It may have been deleted.",
    };
  }
  const offer = row as {
    id: string;
    agent_id: string;
    property_address?: string | null;
    offer_expires_at: string | null;
    status: string;
  };

  // Anti-replay: the token pins `prevExpiresAt`. If the offer's current
  // expiration differs from what was pinned when the email was sent,
  // something has changed (extended already, manually updated, cleared).
  // Refuse to silently re-extend.
  if (offer.offer_expires_at !== payload.prevExpiresAt) {
    return {
      kind: "error",
      title: "Link already used",
      body: "This link was already used or the offer's expiration has changed. Check the offer in the app for its current state.",
    };
  }

  if (!["draft", "submitted", "countered"].includes(offer.status)) {
    return {
      kind: "error",
      title: "Offer isn't active",
      body: "This offer is accepted, rejected, withdrawn, or expired — it can't be extended.",
    };
  }

  const newExpiresAtIso = new Date(
    Date.now() + payload.extendHours * 3600 * 1000,
  ).toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from(table)
    .update({
      offer_expires_at: newExpiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offer.id)
    .eq("agent_id", offer.agent_id);
  if (updateErr) {
    return {
      kind: "error",
      title: "Couldn't extend",
      body: "Something went wrong saving the new expiration. Try again, or update the offer directly in the app.",
    };
  }

  const propertyAddress = await resolveAddress(payload.kind, offer);
  const offerUrl =
    payload.kind === "buyer"
      ? `/dashboard/offers/${offer.id}`
      : `/dashboard/listing-offers/${offer.id}`;
  return {
    kind: "ok",
    address: propertyAddress ?? "this offer",
    newExpiresAtIso,
    offerUrl,
  };
}

async function resolveAddress(
  kind: "buyer" | "listing",
  offer: { id: string; property_address?: string | null },
): Promise<string | null> {
  if (offer.property_address) return offer.property_address;
  if (kind === "buyer") return null;
  // Listing-side: property_address lives on the parent transaction.
  try {
    const { data } = await supabaseAdmin
      .from("listing_offers")
      .select("transaction_id")
      .eq("id", offer.id)
      .maybeSingle();
    const txId = (data as { transaction_id?: string } | null)?.transaction_id;
    if (!txId) return null;
    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("property_address")
      .eq("id", txId)
      .maybeSingle();
    return (tx as { property_address?: string | null } | null)?.property_address ?? null;
  } catch {
    return null;
  }
}

function ConfirmationPage({ outcome }: { outcome: ExtendOutcome }) {
  if (outcome.kind === "ok") {
    const whenLabel = new Date(outcome.newExpiresAtIso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return (
      <div className="mx-auto max-w-md space-y-5 px-4 py-10">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center shadow-sm">
          <div className="text-4xl">✅</div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Offer extended</h1>
          <p className="mt-2 text-sm text-slate-700">{outcome.address}</p>
          <p className="mt-1 text-sm text-slate-700">
            New expiration: <strong>{whenLabel}</strong>
          </p>
        </div>
        <a
          href={outcome.offerUrl}
          className="block rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open offer in CloseBoss →
        </a>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-10">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
        <div className="text-4xl">⚠️</div>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">{outcome.title}</h1>
        <p className="mt-2 text-sm text-slate-700">{outcome.body}</p>
      </div>
      <a
        href="/dashboard"
        className="block rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Go to your dashboard →
      </a>
    </div>
  );
}

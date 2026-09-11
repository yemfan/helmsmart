/**
 * GET /api/stripe/checkout?invoice=[id]
 *
 * Creates a Stripe Checkout Session for the given invoice and redirects the
 * client to the Stripe-hosted payment page. No session auth — the invoice UUID
 * acts as a capability token (same pattern as /pay/[id]).
 *
 * The charge is in the org's `organizations.currency`, the currency /pay/[id]
 * shows the total in. It used to be hardcoded to USD, so a CAD, EUR or GBP
 * invoice was charged its own number in dollars. `lib/stripe-amount` turns the
 * total into Stripe's minor units (JPY and KRW have none) and knows each
 * currency's minimum.
 *
 * The reader of an error here is the CUSTOMER — the Pay button is a plain link,
 * so the JSON is the page they see — so errors are in their locale, resolved
 * the way /pay/[id] resolves it: cookie, then Accept-Language.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY      — Stripe secret key (sk_live_... or sk_test_...)
 *   NEXT_PUBLIC_APP_URL    — Full origin for redirect URLs
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { DEFAULT_CURRENCY, moneyFormatter } from "@/lib/books-format";
import { stripeMinimum, toStripeAmount } from "@/lib/stripe-amount";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoice");
  const [locale, t] = await Promise.all([getServerLocale(), getServerT("public")]);

  if (!invoiceId) {
    return NextResponse.json({ error: t("pay.checkout.missingInvoice") }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: t("pay.checkout.notConfigured") }, { status: 503 });
  }

  const supabase = await createServiceClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, status, total, stripe_session_id,
      clients (first_name, last_name, email),
      organizations (name, currency)
    `)
    .eq("id", invoiceId)
    .single();

  if (!inv) {
    return NextResponse.json({ error: t("pay.checkout.notFound") }, { status: 404 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");

  if (inv.status === "paid") {
    return NextResponse.redirect(`${appUrl}/pay/${invoiceId}`);
  }
  if (inv.status === "void") {
    return NextResponse.json({ error: t("pay.void") }, { status: 400 });
  }

  const clientRaw = inv.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;

  const orgRaw = inv.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    name: string;
    currency: string | null;
  } | null;

  const currency = org?.currency || DEFAULT_CURRENCY;
  const total = Number(inv.total);
  const unitAmount = toStripeAmount(total, currency);

  // Also catches a non-numeric total, which rounds to NaN and would otherwise
  // reach Stripe.
  if (!(unitAmount > 0)) {
    return NextResponse.json({ error: t("pay.checkout.nothingDue") }, { status: 400 });
  }
  const minimum = stripeMinimum(currency);
  if (minimum !== null && unitAmount < toStripeAmount(minimum, currency)) {
    const fmt = moneyFormatter(locale, currency);
    return NextResponse.json(
      { error: t("pay.checkout.belowMinimum", { amount: fmt(total), minimum: fmt(minimum) }) },
      { status: 400 }
    );
  }

  const stripe = new Stripe(stripeKey);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.trim().toLowerCase(),
            product_data: {
              name: `Invoice ${inv.invoice_number}`,
              ...(org?.name ? { description: `Payment to ${org.name}` } : {}),
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      ...(client?.email ? { customer_email: client.email } : {}),
      metadata: { invoice_id: invoiceId },
      success_url: `${appUrl}/pay/${invoiceId}?success=1`,
      cancel_url:  `${appUrl}/pay/${invoiceId}?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });
  } catch (err) {
    // Stripe's own message is English and written for the developer; it stays
    // in the log, and the customer gets a sentence in their language.
    console.error("[stripe/checkout] session create error:", err);
    return NextResponse.json({ error: t("pay.checkout.failed") }, { status: 500 });
  }

  // Persist session ID so the webhook can look up the invoice
  await supabase
    .from("invoices")
    .update({ stripe_session_id: session.id })
    .eq("id", invoiceId);

  return NextResponse.redirect(session.url!);
}

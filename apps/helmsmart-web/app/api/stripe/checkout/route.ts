/**
 * GET /api/stripe/checkout?invoice=[id]
 *
 * Creates a Stripe Checkout Session for the given invoice and redirects the
 * client to the Stripe-hosted payment page.
 *
 * No sign-in, BY DESIGN: the invoice id is a capability, the same one
 * `/pay/[id]` takes (see the comment there for why it is safe and what would
 * break it). It lets the holder pay this invoice's total and nothing else. The
 * payer's details are Stripe's to collect, and the invoice is only marked paid
 * by the signature-verified webhook, never by this route.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY      — Stripe secret key (sk_live_... or sk_test_...)
 *   NEXT_PUBLIC_APP_URL    — Full origin for redirect URLs
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoice");

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoice ID" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Payment processing is not configured — contact support." },
      { status: 503 }
    );
  }

  const supabase = await createServiceClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, status, total, stripe_session_id,
      clients (first_name, last_name, email),
      organizations (name)
    `)
    .eq("id", invoiceId)
    .single();

  if (!inv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");

  if (inv.status === "paid") {
    return NextResponse.redirect(`${appUrl}/pay/${invoiceId}`);
  }
  if (inv.status === "void") {
    return NextResponse.json({ error: "This invoice has been voided" }, { status: 400 });
  }

  const stripe = new Stripe(stripeKey);

  const clientRaw = inv.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;

  const orgRaw = inv.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string } | null;

  const amountCents = Math.round(Number(inv.total) * 100);
  if (amountCents < 50) {
    return NextResponse.json(
      { error: "Invoice total is below the Stripe minimum ($0.50)" },
      { status: 400 }
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${inv.invoice_number}`,
              ...(org?.name ? { description: `Payment to ${org.name}` } : {}),
            },
            unit_amount: amountCents,
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
    console.error("[stripe/checkout] session create error:", err);
    const msg = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Persist session ID so the webhook can look up the invoice
  await supabase
    .from("invoices")
    .update({ stripe_session_id: session.id })
    .eq("id", invoiceId);

  return NextResponse.redirect(session.url!);
}

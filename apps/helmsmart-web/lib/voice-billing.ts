/**
 * Voice billing — create a Stripe pending invoice item when a call ends.
 *
 * Only fires for orgs with an active subscription and a Stripe customer ID.
 * Idempotent: checks billed_at before creating the invoice item.
 * Rate: $0.10/min, ceiling-rounded to the nearest whole minute.
 *
 * Stripe invoice items accumulate as pending line items and are collected
 * on the org's next invoice (monthly cycle or manual finalization).
 */

import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
// One rate and one rounding rule, shared with the cost estimate on /voice.
import { VOICE_RATE_CENTS_PER_MINUTE as RATE_CENTS_PER_MINUTE, billableMinutes } from "@/lib/voice-stats";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function billVoiceCall(callSid: string, durationSeconds: number): Promise<void> {
  if (!stripe) return;
  if (!durationSeconds || durationSeconds <= 0) return;

  const db = await createServiceClient();

  const { data: session } = await db
    .from("voice_sessions")
    .select("id, billed_at, organization_id")
    .eq("call_sid", callSid)
    .single();

  if (!session || session.billed_at) return;

  const { data: org } = await db
    .from("organizations")
    .select("stripe_customer_id, subscription_status")
    .eq("id", session.organization_id)
    .single();

  if (!org?.stripe_customer_id) return;
  if (org.subscription_status !== "active") return;

  const minutes = billableMinutes(durationSeconds);
  const amountCents = minutes * RATE_CENTS_PER_MINUTE;

  try {
    await stripe.invoiceItems.create({
      customer: org.stripe_customer_id,
      amount: amountCents,
      currency: "usd",
      description: `Voice AI — ${minutes} min`,
    });
    await db
      .from("voice_sessions")
      .update({ billed_at: new Date().toISOString() })
      .eq("id", session.id);
  } catch (e) {
    console.error("[voice-billing] Stripe error:", e);
  }
}

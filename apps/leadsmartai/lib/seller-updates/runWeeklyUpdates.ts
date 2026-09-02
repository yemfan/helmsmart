import "server-only";

import { isAnthropicConfigured } from "@/lib/anthropic";
import { sendEmail } from "@/lib/email";
import { logEmailMessage } from "@/lib/ai-email/lead-resolution";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { TransactionRow } from "@/lib/transactions/types";
import { gatherListingActivity } from "./gatherActivity";
import {
  buildFallbackCommentary,
  generateSellerCommentary,
} from "./generateCommentary";
import { renderSellerUpdateEmail } from "./renderEmail";

/**
 * Weekly seller-update orchestrator. Runs every Monday morning via
 * /api/cron/seller-weekly-updates.
 *
 * Per-listing flow:
 *   1. Pick active listing_rep / dual transactions with seller_update_enabled=true.
 *   2. Dedupe via seller_update_last_sent_at — skip if sent within the
 *      last 6 days. (Accounts for Vercel retries + agents who enable on
 *      a Tuesday and shouldn't get a same-day blast if the cron fires
 *      again that night.)
 *   3. Resolve seller email via contact_id → contacts.email. Skip if missing.
 *   4. Gather activity snapshot (open-house visitors + listing offers in
 *      the window since last_sent_at or 7 days ago).
 *   5. Commentary: try Claude → fall back to baseline on any error. We
 *      ALWAYS send the email if we have activity data; a dead AI call
 *      shouldn't kill the feature's reliability.
 *   6. Render + send + stamp last_sent_at.
 *
 * Stamping failure is non-fatal for the CURRENT send, but means the
 * next cron run might resend. That's the lesser evil vs not sending
 * at all.
 */

export type RunSellerUpdatesResult = {
  processedListings: number;
  sentEmails: number;
  skippedRecent: number;
  skippedNoSeller: number;
  skippedNoEmail: number;
  skippedNoActivity: number;
  aiFallbackUsed: number;
  failed: number;
};

const MIN_DAYS_BETWEEN_SENDS = 6;

export async function runWeeklySellerUpdates(opts: {
  todayIso?: string;
  limit?: number;
  appBaseUrl?: string;
}): Promise<RunSellerUpdatesResult> {
  const nowIso = opts.todayIso ? `${opts.todayIso}T16:00:00Z` : new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const result: RunSellerUpdatesResult = {
    processedListings: 0,
    sentEmails: 0,
    skippedRecent: 0,
    skippedNoSeller: 0,
    skippedNoEmail: 0,
    skippedNoActivity: 0,
    aiFallbackUsed: 0,
    failed: 0,
  };

  const aiAvailable = isAnthropicConfigured();

  // Pull candidate listings. Partial index on (seller_update_enabled AND
  // listing/dual AND active) keeps this fast.
  const { data: txRows, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("seller_update_enabled", true)
    .in("transaction_type", ["listing_rep", "dual"])
    .in("status", ["active", "pending"])
    .order("seller_update_last_sent_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  const transactions = (txRows ?? []) as TransactionRow[];
  if (!transactions.length) return result;

  const capped = opts.limit && opts.limit > 0 ? transactions.slice(0, opts.limit) : transactions;

  for (const tx of capped) {
    result.processedListings += 1;
    try {
      // Dedupe window — if last send was within MIN_DAYS_BETWEEN_SENDS,
      // skip. Protects against retries + same-day double-sends.
      const lastSent = (tx as { seller_update_last_sent_at?: string | null })
        .seller_update_last_sent_at;
      if (lastSent) {
        const daysSince = (nowMs - new Date(lastSent).getTime()) / 86_400_000;
        if (daysSince < MIN_DAYS_BETWEEN_SENDS) {
          result.skippedRecent += 1;
          continue;
        }
      }

      // Resolve seller (the buyer-side contact_id IS the seller for
      // listing_rep transactions — the naming is legacy).
      if (!tx.contact_id) {
        result.skippedNoSeller += 1;
        continue;
      }
      const { data: contactData } = await supabaseAdmin
        .from("contacts")
        .select("first_name, last_name, name, email")
        .eq("id", tx.contact_id)
        .maybeSingle();
      const seller = contactData as {
        first_name: string | null;
        last_name: string | null;
        name: string | null;
        email: string | null;
      } | null;
      if (!seller?.email) {
        result.skippedNoEmail += 1;
        continue;
      }

      // Gather activity. If there's literally nothing (0 visitors, 0
      // offers, and it's been quiet since last send), we still send —
      // sellers specifically asked to hear weekly. A silent Monday is
      // its own signal.
      const activity = await gatherListingActivity(tx, { nowIso });

      // Commentary — Claude preferred, baseline fallback.
      let commentary;
      if (aiAvailable) {
        try {
          commentary = await generateSellerCommentary(activity);
        } catch (err) {
          console.warn(
            `[seller-updates] AI commentary failed for tx=${tx.id}, using fallback:`,
            err instanceof Error ? err.message : err,
          );
          commentary = buildFallbackCommentary(activity);
          result.aiFallbackUsed += 1;
        }
      } else {
        commentary = buildFallbackCommentary(activity);
        result.aiFallbackUsed += 1;
      }

      // Best-effort agent identity for the email signature.
      const { data: agentRow } = await supabaseAdmin
        .from("agents")
        .select("first_name, last_name, brokerage_name")
        .eq("id", tx.agent_id)
        .maybeSingle();
      const agent = agentRow as {
        first_name: string | null;
        last_name: string | null;
        brokerage_name: string | null;
      } | null;
      const agentName = agent
        ? `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || null
        : null;

      const sellerFirstName =
        seller.first_name ||
        (seller.name ? seller.name.split(/\s+/)[0] : null) ||
        null;

      const { subject, html, text } = renderSellerUpdateEmail({
        activity,
        commentary,
        sellerFirstName,
        agentName,
        agentBrokerage: agent?.brokerage_name ?? null,
      });

      const sent = await sendEmail({ to: seller.email, subject, text, html });
      result.sentEmails += 1;

      // Thread into the Inbox. `seller` is a contacts row — it was loaded by
      // id off `tx.contact_id` — so this is a real conversation, not a
      // notification about one. Best-effort: the mail has already gone.
      try {
        await logEmailMessage({
          leadId: String(tx.contact_id),
          direction: "outbound",
          subject,
          body: text,
          agentId: tx.agent_id ? String(tx.agent_id) : null,
          externalMessageId: sent?.id ? String(sent.id) : null,
        });
      } catch (err) {
        console.warn("[seller-updates] inbox log failed", {
          contactId: tx.contact_id,
          error: err instanceof Error ? err.message : err,
        });
      }

      // Stamp last_sent_at. Failure here is annoying but non-fatal —
      // next cron run would simply re-send.
      try {
        await supabaseAdmin
          .from("transactions")
          .update({ seller_update_last_sent_at: nowIso })
          .eq("id", tx.id);
      } catch (err) {
        console.error(
          `[seller-updates] stamp failed for tx=${tx.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    } catch (err) {
      result.failed += 1;
      console.error(
        `[seller-updates] tx=${tx.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}

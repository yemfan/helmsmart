import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  assembleIssue,
  getLatestDigest,
  getDigestForWeek,
  regionSlugForSubscription,
} from "@/lib/newsletter/assembleIssue";
import {
  renderIssueEmail,
  type IssueEmailAgent,
} from "@/lib/newsletter/emailTemplate";
import {
  newsletterFrom,
  agentNewsletterFrom,
  newsletterMailingAddress,
  newsletterUnsubscribeMailto,
} from "@/lib/newsletter/sendConfig";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { resolveLeadOutboundLocale } from "@/lib/locales/resolveLocale";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/newsletter-send
 *
 * Weekly send of the Regional Newsletter to CONFIRMED, PUBLIC (agent_id NULL)
 * subscribers (Phase 2). Fires Thursday 15:00 UTC — a day after the Wednesday
 * digest generation (see vercel.json).
 *
 * SAFETY GATES:
 *   - NEWSLETTER_SEND_ENABLED must be exactly 'true', else this no-ops. So
 *     merging this route never blasts email until the user flips the flag.
 *   - verifyCronRequest (CRON_SECRET) + service-role required.
 *
 * IDEMPOTENT: only subs with last_sent_week DISTINCT FROM the current week_of are
 * targeted, and last_sent_week is stamped on success — a re-run never
 * double-sends the same issue.
 *
 * Manual smoke test (still requires the flag + a confirmed test sub):
 *   curl "$URL/api/cron/newsletter-send?secret=$CRON_SECRET&limit=1"
 */

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1100; // gentle on Resend's rate limit between batches
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

type SendableSub = {
  id: string;
  email: string;
  region_level: string;
  region_code: string;
  region_name: string | null;
  unsubscribe_token: string;
  last_sent_week: string | null;
  /** Phase 3: null = public CloseBoss sub; bigint = agent-branded sub. */
  agent_id: number | string | null;
};

/** Per-send agent branding + reply-to, or null when the agent has no name. */
type AgentBrand = {
  agent: IssueEmailAgent;
  from: string;
  replyTo: string | undefined;
} | null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Service role not configured" },
      { status: 503 },
    );
  }

  // Hard safety gate: nothing sends until the user explicitly enables it.
  if (process.env.NEWSLETTER_SEND_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "NEWSLETTER_SEND_ENABLED not set" });
  }

  try {
    const url = new URL(req.url);
    const weekParam = url.searchParams.get("week");
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit ? Math.max(0, Math.min(5000, Number(rawLimit) || 0)) : 0;

    // Resolve the issue WEEK from the default-locale digest. Language comes
    // later, per subscriber — this call only establishes which week is out.
    const digest =
      weekParam && WEEK_RE.test(weekParam)
        ? await getDigestForWeek(weekParam)
        : await getLatestDigest();
    if (!digest) {
      return NextResponse.json({ ok: true, skipped: "no published digest" });
    }
    const weekOf = digest.week_of;

    // Confirmed, subscribed subs — BOTH public (agent_id NULL) and agent-branded
    // (agent_id set) — not yet sent this week (Phase 3).
    let query = supabaseServer
      .from("newsletter_subscriptions")
      .select(
        "id, email, region_level, region_code, region_name, unsubscribe_token, last_sent_week, agent_id",
      )
      .eq("status", "subscribed")
      .not("confirmed_at", "is", null)
      .or(`last_sent_week.is.null,last_sent_week.neq.${weekOf}`)
      .order("created_at", { ascending: true });
    if (limit > 0) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      console.error("[newsletter-send] query error", error);
      return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
    }

    const subs = (data ?? []) as SendableSub[];
    if (subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: 0, weekOf });
    }

    // Resolve every subscriber's language in ONE query rather than per send.
    //
    // A newsletter subscriber is not necessarily a contact — most are just an
    // email address off the public form — so this is a best-effort match on
    // (email, agent_id). No contact, or a contact with no stated preference,
    // means English, which is also the variant guaranteed to exist.
    const langByKey = new Map<string, string>();
    const key = (email: string, agentId: number | string | null) =>
      `${email.trim().toLowerCase()}::${agentId ?? ""}`;
    try {
      const emails = Array.from(
        new Set(subs.map((s) => s.email.trim().toLowerCase()).filter(Boolean)),
      );
      if (emails.length > 0) {
        const { data: contactRows } = await supabaseServer
          .from("contacts")
          .select("email, agent_id, preferred_language")
          .in("email", emails)
          .not("preferred_language", "is", null);
        for (const c of contactRows ?? []) {
          const email = String(c.email ?? "").trim().toLowerCase();
          if (!email) continue;
          // One contact can exist per agent under the same address; the first
          // stated preference wins, and a public sub (agent_id null) never
          // matches an agent's contact.
          const k = key(email, c.agent_id ?? null);
          if (!langByKey.has(k)) {
            langByKey.set(
              k,
              resolveLeadOutboundLocale({
                leadPreferredLanguage: c.preferred_language,
              }),
            );
          }
        }
      }
    } catch (e) {
      // A failed lookup sends the whole run in English rather than not at all.
      console.warn("[newsletter-send] language lookup failed", e);
    }

    const siteUrl = getSiteUrl().replace(/\/$/, "");
    const fromAddr = newsletterFrom();
    const mailingAddress = newsletterMailingAddress();
    const unsubMailto = newsletterUnsubscribeMailto();

    // Load each agent's branding ONCE per run (many subs can share one agent).
    // A resolved-to-null entry (missing/nameless agent) is cached too, so a
    // second sub for the same agent falls back to public branding without a
    // repeat DB round-trip.
    const brandCache = new Map<number, AgentBrand>();
    async function brandFor(agentId: number): Promise<AgentBrand> {
      const cached = brandCache.get(agentId);
      if (cached !== undefined) return cached;
      let brand: AgentBrand = null;
      try {
        const a = await loadPresentationAgent(agentId);
        if (a.name?.trim()) {
          brand = {
            agent: {
              name: a.name,
              brokerage: a.brokerage,
              email: a.email,
              phone: a.phone,
              photoUrl: a.photoUrl,
              logoUrl: a.logoUrl,
            },
            from: agentNewsletterFrom(a.name),
            replyTo: a.email?.trim() || undefined,
          };
        }
      } catch (e) {
        console.warn("[newsletter-send] agent branding load failed", { agentId, e });
      }
      brandCache.set(agentId, brand);
      return brand;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < subs.length; i += BATCH_SIZE) {
      const batch = subs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (sub) => {
          try {
            const regionSlug = await regionSlugForSubscription(
              sub.region_level,
              sub.region_code,
            );
            if (!regionSlug) {
              skipped += 1;
              return;
            }
            const language = langByKey.get(key(sub.email, sub.agent_id));
            const issue = await assembleIssue(regionSlug, weekOf, language);
            if (!issue) {
              skipped += 1;
              return;
            }

            const unsubscribeUrl = `${siteUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(
              sub.unsubscribe_token,
            )}`;

            // Agent-branded when agent_id is set AND the agent resolves to a
            // usable identity; else the public CloseBoss send (unchanged).
            let brand: AgentBrand = null;
            if (sub.agent_id !== null && sub.agent_id !== undefined) {
              const aid =
                typeof sub.agent_id === "number"
                  ? sub.agent_id
                  : Number(sub.agent_id);
              if (Number.isFinite(aid)) brand = await brandFor(aid);
            }

            const rendered = renderIssueEmail({
              issue,
              subscription: {
                email: sub.email,
                region_name: sub.region_name,
                region_code: sub.region_code,
              },
              unsubscribeUrl,
              mailingAddress,
              siteUrl,
              agent: brand?.agent ?? null,
            });

            await sendEmail({
              to: sub.email,
              from: brand?.from ?? fromAddr,
              replyTo: brand?.replyTo,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html,
              headers: {
                // RFC 8058 one-click unsubscribe: HTTPS one-click arm + a mailto
                // arm. The POST header tells the provider the URL is one-click.
                "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${unsubMailto}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            // Stamp idempotency marker only on a successful send.
            const { error: updErr } = await supabaseServer
              .from("newsletter_subscriptions")
              .update({ last_sent_week: weekOf })
              .eq("id", sub.id);
            if (updErr) {
              console.error("[newsletter-send] last_sent_week update failed", {
                id: sub.id,
                updErr,
              });
            }
            sent += 1;
          } catch (e) {
            failed += 1;
            console.error("[newsletter-send] per-sub failure", {
              id: sub.id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }),
      );
      // Small pause between batches to respect Resend's rate limit.
      if (i + BATCH_SIZE < subs.length) await sleep(BATCH_DELAY_MS);
    }

    return NextResponse.json({ ok: true, sent, failed, skipped, weekOf });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[newsletter-send] cron:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

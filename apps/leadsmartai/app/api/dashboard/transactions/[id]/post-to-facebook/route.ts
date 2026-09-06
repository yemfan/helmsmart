import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { publishPost } from "@/lib/leads-gen/publish";
import { buildListingCaption, type ListingStatus } from "@/lib/social/captionBuilder";
import { draftListingCaption } from "@/lib/social/draftListingCaption";
import {
  listConnectionsForAgent,
  touchLastUsedAt,
} from "@/lib/social/connectionsService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/transactions/[id]/post-to-facebook
 *
 * Body (all optional except connectionId):
 *   { connectionId: string, hook?: string, link?: string,
 *     captionOverride?: string }
 *
 * v1 lifecycle:
 *   1. Resolve the transaction; verify the agent owns it.
 *   2. Build the caption deterministically from transaction fields,
 *      OR honor a captionOverride the agent typed in the modal.
 *   3. Send via the connection's FB Page token; log the attempt.
 *   4. Return { ok, postId, caption, logId } so the UI can flash a
 *      "Posted to <page>" success and surface the link to the post.
 */
/**
 * GET /api/dashboard/transactions/[id]/post-to-facebook
 *
 * Returns `{ ok, caption, source }` — a ready-to-edit draft for the compose
 * modal, which used to open with an empty textarea because the caption was
 * built only inside POST. The agent saw a blank box and either wrote the post
 * themselves or sent it blank and found out what published afterwards.
 *
 * Read-only: it drafts, it does not post. Falls back to the deterministic
 * caption when the model is unavailable, so the box is never empty.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id: transactionId } = await ctx.params;

    const txn = await loadTransactionForListing(String(agentId), transactionId);
    if (!txn) {
      return NextResponse.json(
        { ok: false, error: "Transaction not found." },
        { status: 404 },
      );
    }
    const agentMeta = await loadAgentDisplayMeta(String(agentId));

    const { caption, source } = await draftListingCaption({
      hook: null,
      propertyAddress: txn.property_address,
      city: txn.city,
      state: txn.state,
      beds: null,
      baths: null,
      sqft: null,
      listPrice: txn.purchase_price,
      agentName: agentMeta.name,
      agentBrokerage: agentMeta.brokerage,
      listingStatus: listingStatusOf(txn),
    });

    return NextResponse.json({ ok: true, caption, source });
  } catch (e) {
    // A failed draft must not block composing — the modal falls back to its
    // own empty state and the agent can still write and post.
    console.error("post-to-facebook draft failed", e);
    return NextResponse.json({ ok: false, error: "Could not draft a caption." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id: transactionId } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as {
      connectionId?: unknown;
      hook?: unknown;
      link?: unknown;
      captionOverride?: unknown;
    };
    const connectionId =
      typeof body.connectionId === "string" ? body.connectionId.trim() : "";
    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "connectionId is required." },
        { status: 400 },
      );
    }

    // Verify the connection belongs to this agent before we go further
    // (the post helper does this too, but bouncing here saves a DB round
    // trip + gives a cleaner error to the UI).
    const connections = await listConnectionsForAgent(String(agentId));
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 },
      );
    }

    const txn = await loadTransactionForListing(String(agentId), transactionId);
    if (!txn) {
      return NextResponse.json(
        { ok: false, error: "Transaction not found." },
        { status: 404 },
      );
    }

    const agentMeta = await loadAgentDisplayMeta(String(agentId));

    const captionOverride =
      typeof body.captionOverride === "string" ? body.captionOverride.trim() : "";
    const built = captionOverride
      ? { caption: captionOverride.slice(0, 1500), hashtags: [] }
      : buildListingCaption({
          hook: typeof body.hook === "string" ? body.hook : null,
          propertyAddress: txn.property_address,
          city: txn.city,
          state: txn.state,
          beds: null,
          baths: null,
          sqft: null,
          listPrice: txn.purchase_price,
          agentName: agentMeta.name,
          agentBrokerage: agentMeta.brokerage,
          listingStatus: listingStatusOf(txn),
        });

    // Publish through the shared rail (lib/leads-gen/publish) — the same path
    // the scheduled-publish cron, Quick Post and the brand poster use. This
    // replaces a second, near-duplicate Facebook publisher; it brings proper
    // `lead_posts` auditing and the shared retryable/permanent error taxonomy.
    const result = await publishPost({
      agentId: String(agentId),
      platform: "facebook",
      connectionId,
      caption: built.caption,
      hashtags: built.hashtags,
      link: typeof body.link === "string" && body.link.trim() ? body.link.trim() : null,
      trigger: "transaction_listing",
      subjectKind: "transaction",
      subjectRefId: transactionId,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          logId: result.leadPostId ?? null,
          caption: built.caption,
        },
        { status: 502 },
      );
    }

    // Surfaces "last used <date>" on the connection in Settings.
    await touchLastUsedAt(connectionId).catch(() => {});

    return NextResponse.json({
      ok: true,
      postId: result.externalPostId,
      postUrl: result.externalPostUrl,
      logId: result.leadPostId,
      caption: built.caption,
      pageName: conn.providerAccountName,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("post-to-facebook:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function loadTransactionForListing(
  agentId: string,
  transactionId: string,
): Promise<{
  status: string | null;
  closing_date: string | null;
  property_address: string;
  city: string | null;
  state: string | null;
  purchase_price: number | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("property_address, city, state, purchase_price, status, closing_date")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    status: string | null;
    closing_date: string | null;
    property_address: string;
    city: string | null;
    state: string | null;
    purchase_price: number | null;
  };
}

/**
 * What to say about where this property stands.
 *
 * `status` is only "active" or "closed", and "closed" means the transaction
 * reached its closing stage — not that the sale has completed, so a closing
 * date in the future is a property in escrow rather than one that has sold.
 * Without this the caption opened "Just listed!" for everything, and the AI
 * draft turned that into #JustListed on a property under contract.
 */
function listingStatusOf(txn: {
  status: string | null;
  closing_date: string | null;
}): ListingStatus {
  if ((txn.status ?? "").toLowerCase() !== "closed") return "on_market";
  const closes = txn.closing_date ? Date.parse(txn.closing_date) : NaN;
  // Unparseable or still ahead of us: in escrow, not sold.
  if (!Number.isFinite(closes) || closes > Date.now()) return "under_contract";
  return "sold";
}

async function loadAgentDisplayMeta(
  agentId: string,
): Promise<{ name: string | null; brokerage: string | null }> {
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("first_name, last_name, brokerage_name")
      .eq("id", agentId)
      .maybeSingle();
    const a = data as
      | {
          first_name: string | null;
          last_name: string | null;
          brokerage_name: string | null;
        }
      | null;
    if (!a) return { name: null, brokerage: null };
    const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || null;
    return { name, brokerage: a.brokerage_name };
  } catch {
    return { name: null, brokerage: null };
  }
}

import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { publishPost } from "@/lib/leads-gen/publish";
import { buildListingCaption } from "@/lib/social/captionBuilder";
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
  property_address: string;
  city: string | null;
  state: string | null;
  purchase_price: number | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("property_address, city, state, purchase_price")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    property_address: string;
    city: string | null;
    state: string | null;
    purchase_price: number | null;
  };
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

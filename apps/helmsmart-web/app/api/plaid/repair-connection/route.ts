import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { syncBankConnections } from "@/lib/plaid-sync";

/**
 * POST /api/plaid/repair-connection
 *
 * Called by the client after Plaid Link succeeds in UPDATE mode — the owner
 * has just signed in again at a bank whose connection we had marked `error`.
 *
 * Body: { connection_id: string }
 *
 * There is NO token to exchange. Update mode repairs the existing Plaid item
 * in place, so the `access_token` we already hold keeps working and the
 * `public_token` Link hands back is not ours to spend. What is left is the
 * state WE wrote: `lib/plaid-sync.ts` set `status: 'error'` with a Plaid error
 * code, and `syncBankConnections` skips any connection that is not `active` —
 * so without this route a perfectly repaired bank would stay skipped forever.
 *
 * Plaid's own LOGIN_REPAIRED webhook does not cover it either: Plaid sends
 * that when an item is repaired OUTSIDE our app (in another Plaid-powered
 * product, or by the bank). A repair that happens in our own Link session is
 * reported by `onSuccess` and nowhere else, which is exactly this call.
 *
 * Returns: { connection_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const orgId = await getMemberOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.noOrganization") },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { connection_id?: string };
    const connectionId = body?.connection_id;
    if (!connectionId) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.missingConnection") },
        { status: 400 },
      );
    }

    const service = await createServiceClient();
    // `.select()` is load-bearing: it is the only way to tell "cleared the
    // error" from "matched nothing". This is the service-role client, which
    // bypasses RLS, so no rows means the id does not exist in THIS org —
    // the `organization_id` filter is what scopes it.
    const { data, error } = await service
      .from("bank_connections")
      .update({ status: "active", error_code: null })
      .eq("id", connectionId)
      .eq("organization_id", orgId)
      .select("id");

    if (error) {
      console.error("[plaid] repair-connection update failed:", error.message);
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.repairFailed") },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.connectionNotFound") },
        { status: 404 },
      );
    }

    // Catch up on everything the connection missed while it was skipped. In
    // process, from `after()`, for the org checked above — the same shape the
    // exchange-token route uses, and for the same reason: a request to our own
    // sync route would carry no Supabase session and be answered 401.
    after(() =>
      syncBankConnections(orgId, connectionId)
        .then(() => undefined)
        .catch((e) => console.error("[plaid] post-repair sync error:", e))
    );

    return NextResponse.json({ connection_id: connectionId });
  } catch (err) {
    console.error("[plaid] repair-connection error:", err);
    return NextResponse.json(
      { error: (await getServerT("books"))("transactions.plaid.repairFailed") },
      { status: 500 },
    );
  }
}

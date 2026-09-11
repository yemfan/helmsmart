import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { syncBankConnections } from "@/lib/plaid-sync";

/**
 * POST /api/plaid/sync
 *
 * Pulls incremental transactions from Plaid for the signed-in member's active
 * org. Idempotent — safe to call multiple times; new transactions are upserted
 * by plaid_transaction_id.
 *
 * Body: { connection_id?: string }
 *   - If connection_id is omitted, syncs all active connections for the org.
 *
 * Returns: { synced: Array<{ connection_id, added, modified, removed, error? }> }
 *
 * The work is `syncBankConnections` in `lib/plaid-sync.ts`. The initial import
 * after linking a bank calls that directly from the exchange-token route: this
 * route needs the caller's session, and a server-to-server request does not
 * have one. Nothing in the app calls this route today; it is the manual entry
 * point.
 */
export async function POST(request: NextRequest) {
  const t = await getServerT("books");
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: t("transactions.plaid.unauthorized") }, { status: 401 });
    }

    const orgId = await getMemberOrgId();
    if (!orgId) {
      return NextResponse.json({ error: t("transactions.plaid.noOrganization") }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as { connection_id?: string };

    return NextResponse.json({ synced: await syncBankConnections(orgId, body.connection_id) });
  } catch (err) {
    console.error("[plaid] sync route error:", err);
    return NextResponse.json({ error: t("transactions.plaid.syncFailed") }, { status: 500 });
  }
}

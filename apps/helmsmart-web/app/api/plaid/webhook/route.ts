import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook";
import { syncBankConnections } from "@/lib/plaid-sync";

export const dynamic = "force-dynamic";

type PlaidWebhook = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string } | null;
};

/** ITEM codes after which the access token does nothing until the owner signs in again. */
const ITEM_BROKEN = new Set(["ERROR", "USER_PERMISSION_REVOKED"]);

/**
 * POST /api/plaid/webhook
 *
 * Where Plaid tells us a linked bank has news. `create-link-token` registers
 * this URL on every Item; before this route existed each call was a 404, so a
 * bank was imported once when it was linked and never again.
 *
 * Authenticated by Plaid's signature, not a session: nothing is read or
 * written until `verifyPlaidWebhook` accepts the `Plaid-Verification` JWT. The
 * org comes from the Item's `bank_connections` row, never from a cookie — see
 * NO_MEMBER_ROUTES in lib/auth/org-guard.test.ts. (`createServiceClient()`
 * resolves the pack from the host, and every Item is registered against the
 * one NEXT_PUBLIC_APP_URL, so the lookup is in Core.)
 *
 *   TRANSACTIONS SYNC_UPDATES_AVAILABLE    → sync that connection
 *   ITEM ERROR, ITEM USER_PERMISSION_REVOKED → mark it `error` with Plaid's code
 *                                            (ITEM_LOGIN_REQUIRED, …)
 *   ITEM LOGIN_REPAIRED                    → mark it `active` again, and sync
 *
 * Everything else is acknowledged and left alone. The older TRANSACTIONS codes
 * (DEFAULT_UPDATE, …) belong to /transactions/get; we use /transactions/sync,
 * whose one signal is SYNC_UPDATES_AVAILABLE.
 *
 * The sync runs in `after()`: Plaid wants an answer within 10 seconds, and a
 * large page of transactions plus AI categorization can take longer.
 */
export async function POST(request: NextRequest) {
  const t = await getServerT("books");
  const body = await request.text();

  if (!(await verifyPlaidWebhook(body, request.headers.get("plaid-verification")))) {
    return NextResponse.json({ error: t("transactions.plaid.webhookUnverified") }, { status: 401 });
  }

  let event: PlaidWebhook;
  try {
    event = JSON.parse(body) as PlaidWebhook;
  } catch {
    return NextResponse.json({ error: t("transactions.plaid.webhookMalformed") }, { status: 400 });
  }

  const kind = `${event.webhook_type}.${event.webhook_code}`;
  const isSync = kind === "TRANSACTIONS.SYNC_UPDATES_AVAILABLE";
  const isBroken = event.webhook_type === "ITEM" && ITEM_BROKEN.has(event.webhook_code ?? "");
  const isRepaired = kind === "ITEM.LOGIN_REPAIRED";
  if (!isSync && !isBroken && !isRepaired) return NextResponse.json({ ok: true, ignored: kind });
  if (!event.item_id) {
    return NextResponse.json({ error: t("transactions.plaid.webhookMalformed") }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: conn, error: lookupError } = await service
    .from("bank_connections")
    .select("id, organization_id, status")
    .eq("plaid_item_id", event.item_id)
    .maybeSingle();
  if (lookupError) {
    console.error("[plaid/webhook] connection lookup failed:", lookupError.message);
    return NextResponse.json({ error: t("transactions.plaid.webhookFailed") }, { status: 500 });
  }
  // An Item we no longer hold is not Plaid's mistake to retry.
  if (!conn) return NextResponse.json({ ok: true, skipped: "unknown_item" });
  if (conn.status === "disconnected") return NextResponse.json({ ok: true, skipped: "disconnected" });

  const orgId = conn.organization_id;
  const connectionId = conn.id;

  const mark = async (patch: { status: "active" | "error"; error_code: string | null }) => {
    const { error } = await service
      .from("bank_connections")
      .update(patch)
      .eq("id", connectionId)
      .eq("organization_id", orgId);
    if (error) console.error("[plaid/webhook] marking connection failed:", error.message);
    return !error;
  };

  if (isBroken) {
    const code = event.error?.error_code ?? event.webhook_code!;
    if (!(await mark({ status: "error", error_code: code }))) {
      return NextResponse.json({ error: t("transactions.plaid.webhookFailed") }, { status: 500 });
    }
    return NextResponse.json({ ok: true, marked: code });
  }

  if (isRepaired && conn.status === "error") {
    if (!(await mark({ status: "active", error_code: null }))) {
      return NextResponse.json({ error: t("transactions.plaid.webhookFailed") }, { status: 500 });
    }
  } else if (conn.status !== "active") {
    // Waiting on its owner to sign in again; a sync would only fail the same way.
    return NextResponse.json({ ok: true, skipped: conn.status });
  }

  // New transactions, or a repaired login catching up on what it missed.
  after(() =>
    syncBankConnections(orgId, connectionId)
      .then(() => undefined)
      .catch((e) => console.error("[plaid/webhook] sync error:", e))
  );
  return NextResponse.json({ ok: true, syncing: connectionId });
}

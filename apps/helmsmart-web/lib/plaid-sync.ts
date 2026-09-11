/**
 * Pull a linked bank's transactions from Plaid into `bank_transactions`.
 *
 * TRUSTS ITS CALLER on `orgId`. The route that calls this has already checked,
 * with `getMemberOrgId()`, that the signed-in user belongs to that org, and
 * every read and write here goes through the service-role client. So this is a
 * plain module, never a "use server" one (where it would be callable by anyone,
 * with any org id), and `lib/auth/org-guard.test.ts` holds each route that
 * reaches it to having made the check.
 *
 * Why it is a function and not only a route: the initial import after linking
 * a bank used to reach `POST /api/plaid/sync` over HTTP. That request carried
 * the org cookie but not the Supabase session cookies, and the sync route
 * validates the session, so it answered 401 and the first import never ran.
 * Called in-process (from `after()` in the exchange-token route), it needs no
 * second session at all.
 */
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { categorizeTransactions } from "@/lib/actions/categorize";

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  })
);

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
type Connection = { id: string; plaid_access_token_enc: string; cursor: string | null };

export type ConnectionSyncResult = {
  connection_id: string;
  added: number;
  modified: number;
  removed: number;
  /** Plaid's error code when this connection failed; it is then marked `error`. */
  error?: string;
};

/**
 * Sync every active connection of `orgId`, or just `connectionId`. Idempotent:
 * transactions are upserted by `plaid_transaction_id`, and each connection's
 * cursor is saved so the next call picks up where this one stopped.
 */
export async function syncBankConnections(
  orgId: string,
  connectionId?: string
): Promise<ConnectionSyncResult[]> {
  const service = await createServiceClient();

  let query = service
    .from("bank_connections")
    .select("id, plaid_access_token_enc, cursor")
    .eq("organization_id", orgId)
    .eq("status", "active");
  if (connectionId) query = query.eq("id", connectionId);

  const { data: connections, error } = await query;
  if (error) {
    console.error("[plaid] loading bank connections failed:", error.message);
    return [];
  }
  if (!connections?.length) return [];

  const results = await Promise.all(
    (connections as Connection[]).map((conn) => syncConnection(service, orgId, conn))
  );

  // AI categorization for what was just imported. Awaited: run from `after()`,
  // a promise nobody waits for can be cut off when the function is frozen.
  if (results.some((r) => r.added > 0 || r.modified > 0)) {
    await categorizeTransactions(orgId).catch((e) =>
      console.warn("[categorize] post-sync categorization failed:", e)
    );
  }

  return results;
}

async function syncConnection(
  service: ServiceClient,
  orgId: string,
  conn: Connection
): Promise<ConnectionSyncResult> {
  try {
    const accessToken = decrypt(conn.plaid_access_token_enc);
    let cursor = conn.cursor ?? undefined;
    let added = 0;
    let modified = 0;
    let removed = 0;
    let hasMore = true;

    // Paginate until Plaid says no more pages
    while (hasMore) {
      const syncRes = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
      });

      const { added: newTxns, modified: modTxns, removed: removedTxns, next_cursor, has_more } = syncRes.data;

      // Resolve account UUIDs from plaid_account_id
      if (newTxns.length > 0 || modTxns.length > 0) {
        const plaidAccountIds = [
          ...new Set([
            ...newTxns.map((t) => t.account_id),
            ...modTxns.map((t) => t.account_id),
          ]),
        ];

        const { data: accountRows } = await service
          .from("bank_accounts")
          .select("id, plaid_account_id")
          .in("plaid_account_id", plaidAccountIds)
          .eq("organization_id", orgId);

        const accountMap = new Map(
          (accountRows ?? []).map((a) => [a.plaid_account_id, a.id])
        );

        const toUpsert = [...newTxns, ...modTxns]
          .filter((t) => accountMap.has(t.account_id))
          .map((t) => ({
            organization_id: orgId,
            account_id: accountMap.get(t.account_id)!,
            plaid_transaction_id: t.transaction_id,
            amount: t.amount,
            iso_currency_code: t.iso_currency_code ?? "USD",
            date: t.date,
            authorized_date: t.authorized_date ?? null,
            name: t.name,
            merchant_name: t.merchant_name ?? null,
            personal_finance_category:
              (t as { personal_finance_category?: { primary?: string } }).personal_finance_category?.primary ?? null,
            personal_finance_category_detail:
              (t as { personal_finance_category?: { detailed?: string } }).personal_finance_category?.detailed ?? null,
            category_legacy: t.category ?? null,
            pending: t.pending,
            plaid_pending_transaction_id: t.pending_transaction_id ?? null,
            // reviewed defaults to false; AI categorization happens after the sync
          }));

        if (toUpsert.length > 0) {
          await service.from("bank_transactions").upsert(toUpsert, {
            onConflict: "plaid_transaction_id",
            ignoreDuplicates: false,
          });
        }
      }

      // Handle removed (pending → cleared replacements, or deleted)
      if (removedTxns.length > 0) {
        // We soft-delete by marking as reviewed=true and memo noting removal
        // Hard delete not allowed by our RLS (no DELETE policy on bank_transactions)
        const removedIds = removedTxns.map((r) => r.transaction_id);
        await service
          .from("bank_transactions")
          .update({ reviewed: true, memo: "[Removed by Plaid]" })
          .in("plaid_transaction_id", removedIds)
          .eq("organization_id", orgId);
      }

      added += newTxns.length;
      modified += modTxns.length;
      removed += removedTxns.length;
      cursor = next_cursor;
      hasMore = has_more;
    }

    // Persist updated cursor and sync timestamp
    await service
      .from("bank_connections")
      .update({ cursor, last_synced_at: new Date().toISOString(), status: "active", error_code: null })
      .eq("id", conn.id)
      .eq("organization_id", orgId);

    // Refresh account balances
    try {
      const balanceRes = await plaidClient.accountsBalanceGet({ access_token: accessToken });
      for (const account of balanceRes.data.accounts) {
        await service
          .from("bank_accounts")
          .update({
            current_balance: account.balances.current,
            available_balance: account.balances.available,
            updated_at: new Date().toISOString(),
          })
          .eq("plaid_account_id", account.account_id)
          .eq("organization_id", orgId);
      }
    } catch (balErr) {
      console.warn("[plaid] balance refresh failed (non-fatal):", balErr);
    }

    return { connection_id: conn.id, added, modified, removed };
  } catch (err: unknown) {
    const plaidError = err as { response?: { data?: { error_code?: string } } };
    const errorCode = plaidError?.response?.data?.error_code ?? "UNKNOWN";
    console.error(`[plaid] sync error for connection ${conn.id}:`, err);

    // Mark connection as errored so UI can prompt re-link
    await service
      .from("bank_connections")
      .update({ status: "error", error_code: errorCode })
      .eq("id", conn.id)
      .eq("organization_id", orgId);

    return { connection_id: conn.id, added: 0, modified: 0, removed: 0, error: errorCode };
  }
}

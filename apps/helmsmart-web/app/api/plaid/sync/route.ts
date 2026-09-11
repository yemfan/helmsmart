import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { categorizeTransactions } from "@/lib/actions/categorize";
import { getMemberOrgId } from "@/lib/auth/org-context";

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

/**
 * POST /api/plaid/sync
 *
 * Pulls incremental transactions from Plaid using the /transactions/sync endpoint.
 * Idempotent — safe to call multiple times; new transactions are upserted by
 * plaid_transaction_id.
 *
 * Body: { connection_id?: string }
 *   - If connection_id is omitted, syncs all active connections for the org.
 *
 * Returns: { synced: Array<{ connection_id, added, modified, removed }> }
 *
 * Called by:
 *   1. exchange-token route after initial link (fire-and-forget)
 *   2. Plaid webhook handler (TRANSACTIONS_SYNC_UPDATES_AVAILABLE)
 *   3. Manual "Refresh" button in the UI
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getMemberOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as { connection_id?: string };

    // Fetch connection(s) to sync
    let query = supabase
      .from("bank_connections")
      .select("id, plaid_item_id, plaid_access_token_enc, cursor")
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (body.connection_id) {
      query = query.eq("id", body.connection_id);
    }

    const { data: connections, error: connQueryError } = await query;

    if (connQueryError || !connections?.length) {
      return NextResponse.json({ synced: [] });
    }

    // Service client for upserts (bypasses RLS for server-side batch writes)
    const service = await createServiceClient();

    const results = await Promise.all(
      connections.map(async (conn) => {
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
                  // reviewed defaults to false; AI categorization happens async
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
            .eq("id", conn.id);

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

          // Fire AI categorization for newly imported transactions (non-blocking)
          if (added > 0 || modified > 0) {
            void categorizeTransactions(orgId).catch((e) =>
              console.warn("[categorize] post-sync categorization failed:", e)
            );
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
            .eq("id", conn.id);

          return { connection_id: conn.id, added: 0, modified: 0, removed: 0, error: errorCode };
        }
      })
    );

    return NextResponse.json({ synced: results });
  } catch (err) {
    console.error("[plaid] sync route error:", err);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}

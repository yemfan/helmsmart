import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { syncBankConnections } from "@/lib/plaid-sync";

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
 * POST /api/plaid/exchange-token
 *
 * Called by the client after Plaid Link succeeds.
 * Exchanges the short-lived public_token for a permanent access_token,
 * encrypts it, and stores the connection + accounts in the DB.
 * Then triggers an initial transaction sync.
 *
 * Body: {
 *   public_token: string,
 *   institution: { id: string; name: string },
 *   accounts: Array<{ id: string; name: string; type: string; subtype: string; mask: string }>
 * }
 *
 * Returns: { connection_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.unauthorized") },
        { status: 401 },
      );
    }

    // The active org — only if this user is a member of it
    const orgId = await getMemberOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.noOrganization") },
        { status: 400 },
      );
    }

    const body = await request.json() as {
      public_token: string;
      institution?: { institution_id?: string; name?: string };
      accounts?: Array<{
        id: string;
        name: string;
        type: string;
        subtype?: string;
        mask?: string;
        // official_name not sent from Plaid Link metadata; enriched during sync
      }>;
    };

    const { public_token, institution, accounts = [] } = body;

    if (!public_token) {
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.missingPublicToken") },
        { status: 400 },
      );
    }

    // Exchange public token for access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    // Encrypt before storing — NEVER store plaintext access tokens
    const encryptedToken = encrypt(access_token);

    // Insert bank_connection (service role bypasses RLS so we can write from server)
    // We use the user-scoped client here — user is an org member so RLS passes.
    const { data: connection, error: connError } = await supabase
      .from("bank_connections")
      .insert({
        organization_id: orgId,
        plaid_item_id: item_id,
        plaid_access_token_enc: encryptedToken,
        institution_id: institution?.institution_id ?? null,
        institution_name: institution?.name ?? null,
        status: "active",
      })
      .select("id")
      .single();

    if (connError || !connection) {
      console.error("[plaid] insert bank_connection error:", connError);
      return NextResponse.json(
        { error: (await getServerT("books"))("transactions.plaid.saveConnectionFailed") },
        { status: 500 }
      );
    }

    // Insert bank_accounts
    if (accounts.length > 0) {
      const { error: accError } = await supabase.from("bank_accounts").insert(
        accounts.map((a) => ({
          organization_id: orgId,
          connection_id: connection.id,
          plaid_account_id: a.id,
          name: a.name,
          type: a.type,
          subtype: a.subtype ?? null,
          mask: a.mask ?? null,
          iso_currency_code: "USD",
        }))
      );

      if (accError) {
        console.error("[plaid] insert bank_accounts error:", accError);
        // Non-fatal — connection exists; sync will handle accounts
      }
    }

    // Import the first transactions once the response is on its way, in this
    // process, for the org checked above. This used to be a fetch to
    // /api/plaid/sync that sent the org cookie but no session, so that route
    // answered 401 and the first import never ran.
    after(() =>
      syncBankConnections(orgId, connection.id)
        .then(() => undefined)
        .catch((e) => console.error("[plaid] initial sync error:", e))
    );

    return NextResponse.json({ connection_id: connection.id });
  } catch (err) {
    console.error("[plaid] exchange-token error:", err);
    return NextResponse.json(
      { error: (await getServerT("books"))("transactions.plaid.exchangeFailed") },
      { status: 500 }
    );
  }
}

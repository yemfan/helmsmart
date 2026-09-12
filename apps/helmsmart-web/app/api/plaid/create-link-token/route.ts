import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getServerT } from "@/lib/i18n/server";
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
 * POST /api/plaid/create-link-token
 *
 * Creates a short-lived Plaid Link token. The client uses it to initialise the
 * Plaid Link iframe/popup.
 *
 * Body (optional): { connection_id?: string }
 *
 * With no body this is the original LINK mode — a token for connecting a new
 * bank, which asks Plaid for the Transactions product.
 *
 * With `connection_id` it is UPDATE mode: a token carrying the existing item's
 * `access_token` and NO `products`, which reopens Link on the bank already
 * linked so its owner can sign in again. Plaid rejects a token that names both
 * — an access token already has its products — so the two are exclusive.
 *
 * The access token is the whole credential for that bank, so update mode is
 * scoped twice over: `getMemberOrgId()` proves the caller belongs to the
 * active org, and the connection is then loaded `.eq("organization_id", orgId)`
 * so a connection id belonging to another business resolves to nothing.
 *
 * Returns: { link_token: string }
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

    // A plain "connect a new bank" click sends no body at all.
    const body = (await request.json().catch(() => ({}))) as { connection_id?: string };
    const connectionId = body?.connection_id;

    const common = {
      user: { client_user_id: user.id },
      client_name: "SMBai",
      country_codes: [CountryCode.Us],
      language: "en",
      // Webhook receives real-time transaction updates (configure in Plaid dashboard)
      webhook: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`
        : undefined,
    };

    if (connectionId) {
      const orgId = await getMemberOrgId();
      if (!orgId) {
        return NextResponse.json(
          { error: (await getServerT("books"))("transactions.plaid.noOrganization") },
          { status: 400 },
        );
      }

      const service = await createServiceClient();
      const { data: connection, error: connError } = await service
        .from("bank_connections")
        .select("plaid_access_token_enc")
        .eq("id", connectionId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (connError) {
        console.error("[plaid] loading connection for update mode failed:", connError.message);
        return NextResponse.json(
          { error: (await getServerT("books"))("transactions.plaid.linkTokenFailed") },
          { status: 500 },
        );
      }
      if (!connection) {
        // Either it was removed, or it belongs to another org. Same answer
        // either way — this one tells the caller nothing about the other org.
        return NextResponse.json(
          { error: (await getServerT("books"))("transactions.plaid.connectionNotFound") },
          { status: 404 },
        );
      }

      const updateRes = await plaidClient.linkTokenCreate({
        ...common,
        access_token: decrypt(connection.plaid_access_token_enc as string),
      });

      return NextResponse.json({ link_token: updateRes.data.link_token });
    }

    const response = await plaidClient.linkTokenCreate({
      ...common,
      products: [Products.Transactions],
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("[plaid] create-link-token error:", err);
    return NextResponse.json(
      { error: (await getServerT("books"))("transactions.plaid.linkTokenFailed") },
      { status: 500 }
    );
  }
}

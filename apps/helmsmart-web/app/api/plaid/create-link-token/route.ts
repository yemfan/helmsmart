import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";

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
 * Creates a short-lived Plaid Link token scoped to the current authenticated user.
 * The client uses this token to initialise the Plaid Link iframe/popup.
 *
 * Returns: { link_token: string }
 */
export async function POST() {
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

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "SMBai",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      // Webhook receives real-time transaction updates (configure in Plaid dashboard)
      webhook: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`
        : undefined,
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

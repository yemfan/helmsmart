/**
 * Legacy Meta OAuth callback path — now runs the MODERN handler.
 *
 * The connect UI starts the Instagram-aware flow at
 * /api/leads-gen/connect/meta/start, but `META_OAUTH_REDIRECT_URI` (and the
 * Meta app's Valid OAuth Redirect URIs) still send Facebook back to THIS path.
 * That mismatch is exactly why every Facebook connect died: the old handler
 * here checked a different state cookie (so it reported `state_mismatch`) and
 * stored pages via connectionsService, which never captured the linked
 * Instagram Business account or portfolio-owned Pages.
 *
 * Rather than make the owner re-whitelist a new redirect URL in the Meta app
 * and change an env var, we run the modern handler at the URL Facebook already
 * targets. It verifies the `meta_oauth_state` cookie the modern /start sets,
 * reads Pages from /me/accounts + the business-portfolio edge, stores
 * `ig_business_user_id`, and redirects to the connect page.
 *
 * The old `exchangeCodeForPages` / connectionsService path is retired for the
 * OAuth callback (connectionsService itself stays — PostToFacebookCard still
 * reads it).
 */
import { GET as metaCallbackGET } from "@/app/api/leads-gen/connect/meta/callback/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = metaCallbackGET;

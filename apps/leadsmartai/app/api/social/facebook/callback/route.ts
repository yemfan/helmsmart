import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { upsertFacebookPagesForAgent } from "@/lib/social/connectionsService";
import {
  exchangeCodeForPages,
  isFacebookOauthConfigFailure,
  loadFacebookOauthConfig,
} from "@/lib/social/facebookOauth";

export const runtime = "nodejs";

const STATE_COOKIE = "fb_oauth_state";
const SETTINGS_RETURN_URL = "/dashboard/settings?tab=channels&social=fb";

/**
 * GET /api/social/facebook/callback?code=…&state=…
 *
 *   1. Verify the agent is authed.
 *   2. Verify the state cookie matches the query state (CSRF gate).
 *   3. Exchange the OAuth code for the user's pages + page tokens.
 *   4. Upsert one row per page in agent_social_connections.
 *   5. Redirect back to /dashboard/settings with a success/error flag.
 *
 * On any failure we redirect with an `error` query param so the
 * settings panel can render a banner; we never throw a 500 to the
 * browser since the agent is mid-flow and a JSON error wouldn't
 * recover them gracefully.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fbError = url.searchParams.get("error");

  // Facebook returns the user to us with ?error=access_denied when they
  // dismiss the consent screen. Pass that through to the settings panel.
  if (fbError) {
    return redirectToSettings(req, `fb_error=${encodeURIComponent(fbError)}`);
  }

  try {
    const { agentId } = await getCurrentAgentContext();

    const cfg = loadFacebookOauthConfig();
    if (isFacebookOauthConfigFailure(cfg)) {
      return redirectToSettings(req, "fb_error=oauth_not_configured");
    }

    if (!code || !state) {
      return redirectToSettings(req, "fb_error=missing_code_or_state");
    }

    const cookieState = req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);

    if (!cookieState || cookieState !== state) {
      return redirectToSettings(req, "fb_error=state_mismatch");
    }

    const pages = await exchangeCodeForPages({ config: cfg.config, code });
    if (pages.length === 0) {
      return redirectToSettings(req, "fb_error=no_pages_returned");
    }

    const result = await upsertFacebookPagesForAgent({
      agentId: String(agentId),
      pages,
    });

    const params = new URLSearchParams({
      fb_connected: "1",
      inserted: String(result.inserted),
      updated: String(result.updated),
    });
    const res = redirectToSettings(req, params.toString());
    // Clear the state cookie so it can't be replayed.
    res.cookies.set(STATE_COOKIE, "", { path: "/api/social/facebook", maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "callback_failed";
    console.error("[social.facebook.callback]", e);
    return redirectToSettings(req, `fb_error=${encodeURIComponent(msg)}`);
  }
}

/**
 * NextResponse.redirect REQUIRES an absolute URL — passing the relative
 * SETTINGS_RETURN_URL throws "URL is malformed". That made every path through
 * this handler throw, including the catch block (which redirects too), so the
 * error escaped as a 500 and masked the real reason. Resolve against the
 * request's own origin.
 */
function redirectToSettings(req: Request, qs: string): NextResponse {
  return NextResponse.redirect(new URL(`${SETTINGS_RETURN_URL}&${qs}`, req.url));
}

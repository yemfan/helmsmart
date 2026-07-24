#!/usr/bin/env node
/**
 * Mint a fresh Google Search Console OAuth refresh token.
 *
 * The GSC cron authenticates with a long-lived refresh token
 * (GSC_OAUTH_REFRESH_TOKEN). While the Google OAuth app is in "Testing"
 * publishing status, Google expires that token after 7 days — so the cron
 * starts 500ing weekly. Publish the app to stop the expiry, then run this
 * once to get a replacement token.
 *
 * Usage (from apps/propertytoolsai):
 *   GSC_OAUTH_CLIENT_ID=xxx GSC_OAUTH_CLIENT_SECRET=yyy node scripts/mint-gsc-refresh-token.mjs
 *
 * It opens a localhost callback, prints a consent URL to paste in your
 * browser, and on approval prints the refresh_token. Copy that into the
 * propertytoolsai Vercel project's GSC_OAUTH_REFRESH_TOKEN env var (all
 * environments) and redeploy.
 *
 * Requires the OAuth client to be a "Desktop app" client (localhost redirect
 * is auto-allowed). `prompt=consent` forces Google to return a fresh
 * refresh_token even if one was issued before.
 */

import http from "node:http";

const CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET?.trim();
const PORT = Number(process.env.MINT_PORT || 5388);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET.\n" +
      "Grab them from the propertytoolsai Vercel env (or Google Cloud → Credentials) and re-run:\n" +
      "  GSC_OAUTH_CLIENT_ID=xxx GSC_OAUTH_CLIENT_SECRET=yyy node scripts/mint-gsc-refresh-token.mjs"
  );
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

async function exchange(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.refresh_token) {
    throw new Error(
      `Token exchange failed (${res.status}): ${JSON.stringify(json)}` +
        (json.refresh_token
          ? ""
          : "\n(No refresh_token returned — make sure the consent screen actually prompted you; prompt=consent should force one.)")
    );
  }
  return json.refresh_token;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${err || "no code"}`);
    console.error(`\n✗ OAuth error: ${err || "no code returned"}`);
    server.close();
    process.exit(1);
  }
  try {
    const refreshToken = await exchange(code);
    res
      .writeHead(200, { "Content-Type": "text/plain" })
      .end("Refresh token minted. You can close this tab and return to the terminal.");
    console.log("\n✓ New refresh token (set GSC_OAUTH_REFRESH_TOKEN in Vercel to this):\n");
    console.log(refreshToken);
    console.log("");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e));
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(authUrl);
  console.log(`\nWaiting for the Google redirect on ${REDIRECT_URI} ...`);
});

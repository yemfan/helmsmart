import { supabaseBrowser } from "./supabaseBrowser";

/**
 * The browser client is cookie-backed (`@supabase/ssr` `createBrowserClient`),
 * so `getSession()` reads the same session the server sees via cookies — the
 * attached Bearer always resolves to the cookie user, never a different one.
 * Attaching `Authorization: Bearer <access_token>` lets `getUserFromRequest`
 * authenticate reliably for clients where the cookie may not ride along (e.g.
 * multipart/FormData or non-browser callers).
 */
export async function mergeAuthHeaders(base?: HeadersInit): Promise<HeadersInit> {
  const headers = new Headers(base ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return headers;
}

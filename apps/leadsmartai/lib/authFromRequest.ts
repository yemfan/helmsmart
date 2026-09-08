import type { User } from "@supabase/supabase-js";
import { supabaseServerClient } from "@/lib/supabaseServerClient";

/**
 * The signed-in user for a route handler: Bearer first, then the cookie
 * session.
 *
 * The cookie path verifies the JWT locally with `getClaims` and only falls
 * back to `getUser` — a round-trip to Supabase Auth — when it cannot. Every
 * one of the ~55 routes gating on this paid that round-trip before their
 * first query; `/api/me` alone sat at 1.3 s on production (2026-09-08). The
 * dashboard's own `getCurrentAgentContext` has read claims first since #1071.
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const supabase = supabaseServerClient();

  // Prefer Bearer when present (multipart / mobile clients can pair it reliably with FormData).
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data: tokenUserData, error: tokenUserErr } = await supabase.auth.getUser(token);
    if (!tokenUserErr && tokenUserData?.user) return tokenUserData.user;
  }

  const { data: claimsData } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (typeof claims?.sub === "string" && claims.sub) return userFromClaims(claims);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (!userErr && userData?.user) return userData.user;

  return null;
}

/**
 * The `User` shape from a verified access token. Callers read `id` and
 * `email` (and occasionally the metadata blobs, which the token carries);
 * the account timestamps live only on the Auth server and are left empty.
 */
function userFromClaims(c: Record<string, unknown>): User {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    id: String(c.sub),
    email: str(c.email),
    phone: str(c.phone),
    aud: str(c.aud) ?? "authenticated",
    role: str(c.role),
    app_metadata: (c.app_metadata as User["app_metadata"] | undefined) ?? {},
    user_metadata: (c.user_metadata as User["user_metadata"] | undefined) ?? {},
    is_anonymous: Boolean(c.is_anonymous),
    created_at: "",
  } as User;
}


import "server-only";

import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * The email addresses of an organization's owners and admins.
 *
 * WHY THIS IS NOT A JOIN. The obvious query is the one that was here:
 *
 *     .from("organization_members").select("role, user:user_id(email)")
 *
 * It returns nothing, always. `organization_members` has no email column — only
 * `user_id`, which points at `auth.users`, and PostgREST cannot embed across
 * schemas from `public`. The request fails with PGRST200 ("no foreign key
 * relationship … in the schema 'public'"), supabase-js hands back `data: null`,
 * and every caller filtered an empty list and mailed nobody.
 *
 * Nothing about that is visible from the outside: no exception, no error in the
 * logs, just a digest that never arrives. The weekly digest has shipped this
 * way, and the booking alert was written against the same shape before a check
 * against the live database showed neither could ever have sent.
 *
 * The Admin Auth API is the supported route to an auth.users row from server
 * code holding the service key, so that is what this uses. One lookup per
 * member — these lists are a handful of people, not a table scan.
 */
export async function orgOwnerEmails(db: ServiceClient, orgId: string): Promise<string[]> {
  const { data: members, error } = await db
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .in("role", ["owner", "admin"]);

  if (error) {
    console.error("[org-recipients] member lookup failed:", error.message);
    return [];
  }

  const ids = (members ?? [])
    .map((m) => String((m as { user_id?: unknown }).user_id ?? ""))
    .filter(Boolean);
  if (!ids.length) return [];

  const emails = await Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error: authError } = await db.auth.admin.getUserById(id);
        if (authError) {
          console.error("[org-recipients] auth lookup failed for", id, authError.message);
          return null;
        }
        return data?.user?.email ?? null;
      } catch (e) {
        console.error("[org-recipients] auth lookup threw for", id, e);
        return null;
      }
    }),
  );

  // De-duplicated: one person can hold both roles across a merged membership,
  // and nobody wants the same alert twice.
  return [...new Set(emails.filter((e): e is string => Boolean(e)))];
}

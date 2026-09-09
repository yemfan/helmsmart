import "server-only";

import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * One person who should get an organization's owner mail.
 *
 * `userId` is here because the address alone cannot answer what language to
 * write in. `user_preferences.ui_locale` is keyed by user, so a digest that
 * only knew the email had no way to reach the recipient's own language and
 * every owner got English. See `lib/i18n/userLocale.ts`.
 */
export type OrgRecipient = { userId: string; email: string };

/**
 * The owners and admins of an organization, as id + address pairs.
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
export async function orgOwnerRecipients(
  db: ServiceClient,
  orgId: string,
): Promise<OrgRecipient[]> {
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

  const found = await Promise.all(
    ids.map(async (id): Promise<OrgRecipient | null> => {
      try {
        const { data, error: authError } = await db.auth.admin.getUserById(id);
        if (authError) {
          console.error("[org-recipients] auth lookup failed for", id, authError.message);
          return null;
        }
        const email = data?.user?.email ?? null;
        return email ? { userId: id, email } : null;
      } catch (e) {
        console.error("[org-recipients] auth lookup threw for", id, e);
        return null;
      }
    }),
  );

  // De-duplicated by address: one person can hold both roles across a merged
  // membership, and nobody wants the same alert twice.
  const byEmail = new Map<string, OrgRecipient>();
  for (const r of found) {
    if (r && !byEmail.has(r.email)) byEmail.set(r.email, r);
  }
  return [...byEmail.values()];
}

/** Just the addresses, for senders that do not render per recipient. */
export async function orgOwnerEmails(db: ServiceClient, orgId: string): Promise<string[]> {
  return (await orgOwnerRecipients(db, orgId)).map((r) => r.email);
}

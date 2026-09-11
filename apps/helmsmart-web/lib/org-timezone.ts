import "server-only";

import { cookies } from "next/headers";
import { safeTimezone } from "@repo/voice/datetime";

import { createClient, type createServiceClientFor } from "@/lib/supabase/server";
import { calendarDate } from "@/lib/org-date";

/**
 * The organization's IANA timezone — `organizations.timezone`, set under
 * Settings → General and defaulted to `America/New_York` by the schema.
 *
 * Passed through `safeTimezone`, the same guard the booking flow uses, so a
 * typo saved in Settings degrades to the default instead of throwing a
 * RangeError out of every `Intl` call downstream. Falls back the same way when
 * the cookie has no org or the row is unreadable.
 */
export async function orgTimezone(orgId?: string): Promise<string> {
  let id = orgId;
  if (!id) {
    const cookieStore = await cookies();
    id = cookieStore.get("helmsmart-org-id")?.value ?? "";
  }
  if (!id) return safeTimezone(null);

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("timezone")
      .eq("id", id)
      .maybeSingle();
    return safeTimezone(data?.timezone as string | null);
  } catch {
    return safeTimezone(null);
  }
}

/** Today's date (`YYYY-MM-DD`) in the organization's timezone. */
export async function orgToday(orgId?: string): Promise<string> {
  return calendarDate(await orgTimezone(orgId));
}

type ServiceDb = ReturnType<typeof createServiceClientFor>;

/**
 * Each org's date at `at`, for a cron holding rows from many orgs — one query
 * for the batch. An org it cannot read gets the schema default, the same as
 * `calendarDate` does for a bad zone.
 */
export async function orgTodays(
  db: ServiceDb,
  orgIds: string[],
  at: Date = new Date(),
): Promise<(orgId: string) => string> {
  const ids = [...new Set(orgIds)];
  const { data } = ids.length
    ? await db.from("organizations").select("id, timezone").in("id", ids)
    : { data: [] };
  const tzOf = new Map((data ?? []).map((o) => [o.id as string, o.timezone as string | null]));
  return (orgId) => calendarDate(tzOf.get(orgId), at);
}

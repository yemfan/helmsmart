"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type NotificationType =
  | "invoice_paid"
  | "invoice_overdue"
  | "new_message"
  | "missed_call"
  | "booking"
  | "system";

// ─── Create (called from server actions / webhooks) ───────────────────────────

/**
 * What a notification says, and in whose language.
 *
 * `title`/`body` are English and REQUIRED. `titleKey`/`bodyKey` name a key in
 * the `notifications` namespace and, when present, are what the reader
 * actually sees — rendered at read time, in their language, with `params`
 * interpolated.
 *
 * Both halves, not one. The bell has rows written before keys existed, and a
 * key that is missing from a bundle should degrade to an English sentence
 * rather than to a blank line. So English is the floor and the key is the
 * improvement.
 *
 * Why this exists at all: the bell used to render `title` verbatim, so a
 * sentence composed in English at the moment an invoice was paid stayed
 * English forever. A Spanish-reading owner got a fully Spanish dashboard with
 * an English list inside the bell, and no bundle could reach it.
 */
export type NotificationContent = {
  type: NotificationType;
  /** English, always — the fallback and the record of what happened. */
  title: string;
  body?: string;
  link?: string;
  /** Key in the `notifications` namespace; preferred over `title` when set. */
  titleKey?: string;
  bodyKey?: string;
  /** Interpolation values for the keys, e.g. `{ number: "INV-1042" }`. */
  params?: Record<string, string | number>;
};

/** Creates a notification using the service role — safe to call from webhooks. */
export async function createNotificationService(
  orgId: string,
  data: NotificationContent,
  db?: Awaited<ReturnType<typeof createServiceClient>>,
) {
  // `db` lets cron jobs pass the iterated pack client (so a medical org's
  // notification lands in the medical project); webhooks/actions omit it and
  // get the host-resolved client.
  const supabase = db ?? await createServiceClient();
  await supabase.from("notifications").insert({
    organization_id: orgId,
    type: data.type,
    title: data.title,
    body: data.body ?? null,
    link: data.link ?? null,
    title_key: data.titleKey ?? null,
    body_key: data.bodyKey ?? null,
    params: data.params ?? null,
  });
}

/** Creates a notification using the session-auth client — safe to call from server actions. */
export async function createNotification(data: NotificationContent) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return;
  await createNotificationService(orgId, data);
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markNotificationsRead(ids?: string[]) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return;

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read: true })
    .eq("organization_id", orgId);

  if (ids?.length) {
    query = query.in("id", ids);
  } else {
    query = query.eq("read", false);
  }

  await query;
  revalidatePath("/", "layout");
}

// ─── Get unread count (for layout) ───────────────────────────────────────────

export async function getUnreadCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("read", false);
  return count ?? 0;
}

// ─── Get recent notifications ─────────────────────────────────────────────────

export async function getRecentNotifications(orgId: string, limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read, created_at, title_key, body_key, params")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

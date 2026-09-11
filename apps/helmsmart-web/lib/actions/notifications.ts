"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getMemberOrgId } from "@/lib/auth/org-context";
// Webhooks and crons import `createNotificationService` from there directly: as
// an export of this "use server" module it was an action anyone could call.
import { createNotificationService, type NotificationContent } from "@/lib/notifications-service";

// ─── Create (called from server actions) ──────────────────────────────────────

/** Creates a notification for the caller's own active org — safe to call from server actions. */
export async function createNotification(data: NotificationContent) {
  const orgId = await getMemberOrgId();
  if (!orgId) return;
  await createNotificationService(orgId, data);
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markNotificationsRead(ids?: string[]) {
  const orgId = await getMemberOrgId();
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

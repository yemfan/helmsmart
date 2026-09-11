import { createServiceClient } from "@/lib/supabase/server";

/*
 * Service-role notification writes, for webhooks and crons that have no user.
 *
 * This lived in `lib/actions/notifications.ts`, a `"use server"` module — and
 * every export of such a module is a server action anyone can invoke with any
 * arguments. `createNotificationService(orgId, …)` writes with the RLS-bypass
 * client to whatever org it is handed, so as an action it let a caller drop a
 * notification (title, body and link) into any business's bell. Here it is an
 * ordinary server function: callable from server code, not from the browser.
 * Server actions keep using `createNotification`, which checks membership.
 */

export type NotificationType =
  | "invoice_paid"
  | "invoice_overdue"
  | "new_message"
  | "missed_call"
  | "booking"
  | "system";

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

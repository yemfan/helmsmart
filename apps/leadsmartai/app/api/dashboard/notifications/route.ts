import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  listAgentInboxNotifications,
  markAgentNotificationRead,
  markAllAgentNotificationsRead,
} from "@/lib/notifications/agentNotifications";

export const runtime = "nodejs";

/**
 * Web counterpart of /api/mobile/notifications — same table, same helpers,
 * session auth instead of a bearer token. The web notifications page used to
 * read three unrelated sources and had no read state at all, while the bell
 * counted unread rows here; the two never agreed.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const notifications = await listAgentInboxNotifications(agentId, limit);
    return NextResponse.json({ ok: true, notifications });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as {
      markAllRead?: boolean;
      notificationId?: string;
      read?: boolean;
    };
    if (body.markAllRead) {
      await markAllAgentNotificationsRead(agentId);
      return NextResponse.json({ ok: true });
    }
    const id = typeof body.notificationId === "string" ? body.notificationId.trim() : "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "notificationId required" }, { status: 400 });
    }
    await markAgentNotificationRead(agentId, id, body.read !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

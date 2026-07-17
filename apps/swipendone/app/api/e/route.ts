import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ACTIONS = new Set([
  "view",
  "complete",
  "parts_checked",
  "finished",
  "register_clicked",
]);

/**
 * Fire-and-forget step-event logger (handoff §5). Never blocks the buyer UI, so
 * it always returns 204 even on bad input / missing config.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { guide_id, scan_id, step_position, action } = body ?? {};
    if (!guide_id || !ACTIONS.has(action)) {
      return new NextResponse(null, { status: 204 });
    }
    const admin = createAdminClient();
    if (admin) {
      await admin.from("step_events").insert({
        guide_id,
        scan_id: scan_id ?? null,
        step_position: typeof step_position === "number" ? step_position : null,
        action,
      });
    }
  } catch {
    // swallow — analytics must never surface an error to the buyer
  }
  return new NextResponse(null, { status: 204 });
}

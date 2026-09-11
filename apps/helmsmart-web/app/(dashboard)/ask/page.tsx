import { redirect } from "next/navigation";
import { ASK_MARK_LANDING } from "@/lib/ask-mark";

/**
 * `/ask` was a full-page chat that nothing linked to, beside a floating panel
 * that answered the same questions from the same endpoint. There is one place
 * to ask now — the Ask Mark panel — so this lands on the dashboard with it
 * open (`lib/ask-mark.ts`). The route stays, and stays in `proxy.ts`'s
 * DASHBOARD_SEGMENTS, so old links still work and a signed-out visit still
 * goes to /login first.
 */
export default function AskPage(): never {
  redirect(ASK_MARK_LANDING);
}

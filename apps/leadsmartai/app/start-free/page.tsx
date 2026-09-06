import { redirect } from "next/navigation";

/**
 * Bare `/start-free` has no page of its own — the real signup flow lives at
 * `/start-free/agent`. Historically the bare
 * route 404'd, which broke the homepage "Start free trial" CTA
 * (MarketingTopNav) plus the try-demo, DemoShell, and switch-from links that
 * all point at `/start-free`. Default to the agent flow, which itself gates
 * on auth (→ /login) and existing plan (→ /agent/dashboard).
 */
export default function StartFreePage() {
  redirect("/start-free/agent");
}

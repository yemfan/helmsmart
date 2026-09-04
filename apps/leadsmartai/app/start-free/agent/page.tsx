import { redirect } from "next/navigation";

/**
 * Retired conversion page for the feature-tier ladder.
 *
 * It offered a free agent workspace alongside paid cards priced at $49 / $99 /
 * $249 — two repricings out of date, against real charges of $159 / $299 /
 * $399 — and checked out through `/api/billing/crm/checkout`, which no longer
 * sells anything.
 *
 * Its free half is redundant: `getCurrentAgentContext` calls
 * `ensureFreeLeadsmartAccount`, so any signed-in user without an `agents` row
 * is given one the moment they open the dashboard. That path is what quietly
 * rescued the signups this page was supposed to catch. So the whole page
 * reduces to "go to the dashboard".
 *
 * The route already required a session, so there is no anonymous case to
 * handle — the dashboard sends those to login itself.
 */
export default function RetiredStartFreeAgentPage() {
  redirect("/dashboard");
}

import { requireRole } from "@/lib/auth/requireRole";
import { collectObservability } from "@/lib/observability/collect";
import { ObservabilityClient } from "./ObservabilityClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Observability | Admin | LeadSmart AI",
  description:
    "Per-cron + AI-feature health across the platform: last-run, send / skip / error counts over the last 7 days.",
};

/**
 * Admin-only observability overview. Lists every cron we've shipped +
 * the two on-demand AI features (growth opportunities, deal reviews).
 *
 * Not linked in the sidebar. Support hits this when someone asks
 * "is the wire-fraud cron firing?" or "why are the Monday emails
 * landing late?" — single page, single answer.
 */
export default async function AdminObservabilityPage() {
  const t = await getServerT();
  await requireRole(["admin"]);
  const report = await collectObservability({ windowDays: 7 });
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <ObservabilityClient report={report} />
    </div>
  );
}

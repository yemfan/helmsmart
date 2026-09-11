import { listEmployees } from "@helm/ai-workforce";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { listProposedApprovals, listUnconfirmedApprovals } from "@/lib/ai-team/approvals";
import { teamFaces } from "@/lib/ai-team/faces";
import { toApprovalView, type ApprovalView } from "@/lib/ai-team/approval-view";
import { ApprovalCard } from "@/components/approval-card";

/**
 * "Needs your approval" — what the AI team has lined up for a customer and is
 * waiting on the owner to say yes to, at the top of /home above the AI
 * activity feed — and, above those, any approved send that never reported
 * back (the owner checks the conversation and dismisses it; it is never
 * retried). Renders nothing when nothing is waiting (or the list can't be
 * read), so it never takes the dashboard with it.
 *
 * Plain rows in the page's own type; the cards group with a light border and
 * only a failure is coloured.
 */
export async function NeedsApproval({ orgId }: { orgId: string }) {
  if (!orgId) return null;
  const t = await getServerT("home");

  let views: ApprovalView[];
  try {
    const supabase = await createClient();
    const now = new Date();
    const [proposed, unconfirmed, employees] = await Promise.all([
      listProposedApprovals(supabase, orgId, now),
      listUnconfirmedApprovals(supabase, orgId, now),
      listEmployees(supabase, orgId).catch(() => []),
    ]);
    // A send we couldn't confirm first: the owner should check the
    // conversation before anything else goes to that customer.
    const rows = [...unconfirmed, ...proposed];
    if (rows.length === 0) return null;
    const team = teamFaces(employees);
    views = rows.map((r) => toApprovalView(r, team, now));
  } catch (e) {
    console.error("[needs-approval] could not load approvals", e);
    return null;
  }

  return (
    <section aria-labelledby="needs-approval-heading" className="mt-5 max-w-2xl">
      <h2 id="needs-approval-heading" className="text-sm font-semibold text-slate-800">
        {t("aiApprovals.title")}
      </h2>
      <ul className="mt-2 space-y-2">
        {views.map((v) => (
          <li key={v.id}>
            <ApprovalCard approval={v} />
          </li>
        ))}
      </ul>
    </section>
  );
}

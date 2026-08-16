import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { acceptInvite } from "@/lib/teams/service";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Accept team invitation",
  robots: { index: false },
};

/**
 * Public-ish accept-invite endpoint. Requires the invitee to be
 * signed in (we need their agent_id to insert the membership row),
 * so the route bounces unauthenticated visitors to login with a
 * `next` redirect back here.
 *
 * On accept, the membership row is upserted (idempotent if they
 * click the link twice) and the invite is marked accepted.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getServerT();
  const { token } = await params;

  let agentId: string;
  try {
    const ctx = await getCurrentAgentContext();
    agentId = ctx.agentId;
  } catch {
    redirect(`/login?next=${encodeURIComponent(`/team/accept/${token}`)}`);
  }

  const result = await acceptInvite({ rawToken: token, acceptingAgentId: agentId });

  if (result.ok) {
    redirect("/dashboard/team");
  }

  // After the early redirect above, this branch is the failure case.
  // tsconfig.strict:false here doesn't narrow the discriminated union,
  // so we cast to the failure half explicitly.
  const failure = result as { ok: false; reason: "expired" | "used" | "not_found" };

  return (
    <div className="mx-auto max-w-md p-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Invitation can&apos;t be used
        </h1>
        <p className="mt-2 text-sm text-slate-600">{describeReason(failure.reason)}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function describeReason(reason: "expired" | "used" | "not_found"): string {
  switch (reason) {
    case "expired":
      return "This invitation has expired. Ask your team owner for a fresh link.";
    case "used":
      return "This invitation has already been accepted. You're already a member of the team.";
    case "not_found":
      return "We couldn't find a matching invitation. The link may be malformed or revoked.";
  }
}

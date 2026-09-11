"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { requireOrgMember } from "@/lib/auth/org-context";
import { buildActionContext } from "@/lib/ai-team/context";
import { decideApprovalCore } from "@/lib/ai-team/decide";
import { defaultDecideDeps } from "@/lib/ai-team/registry";
import { toApprovalView, type DecideApprovalResult } from "@/lib/ai-team/approval-view";

/**
 * The owner's Approve / Decline on an AI-team proposal — from the Ask Mark
 * panel or the "Needs your approval" list on /home.
 *
 * Membership first (the org is the cookie's, checked); then everything else —
 * the action's own permission, expiry, the claim that makes a double click
 * execute once, the send and its real outcome — is `decideApprovalCore`.
 * Runs on the caller's RLS client, so the database's own policies stand
 * behind every check here.
 */
export async function decideApproval(
  id: string,
  decision: "approve" | "decline",
  edits?: { message?: string },
): Promise<DecideApprovalResult> {
  const access = await requireOrgMember();
  if (!access.ok) return { ok: false, error: access.error, view: null };
  if ((decision !== "approve" && decision !== "decline") || typeof id !== "string") {
    const t = await getServerT("home");
    return { ok: false, error: t("aiApprovals.errors.failed"), view: null };
  }

  const db = await createClient();
  const ctx = await buildActionContext({ db, orgId: access.orgId, userId: access.userId, role: access.role });
  const safeEdits = edits && typeof edits.message === "string" ? { message: edits.message.slice(0, 5000) } : undefined;

  const out = await decideApprovalCore(ctx, id, decision, safeEdits, defaultDecideDeps);
  revalidatePath("/home");

  const view = out.row ? toApprovalView(out.row, ctx.team, ctx.now) : null;
  if (out.ok && view) return { ok: true, view };
  return { ok: false, error: out.ok ? ctx.i18n.home("aiApprovals.errors.failed") : out.error, view };
}

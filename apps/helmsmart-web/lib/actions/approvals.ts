"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { requireOrgMember } from "@/lib/auth/org-context";
import { buildActionContext } from "@/lib/ai-team/context";
import { decideApprovalCore, dismissUnconfirmedCore, type DecideCoreResult } from "@/lib/ai-team/decide";
import { defaultDecideDeps } from "@/lib/ai-team/registry";
import type { ActionContext } from "@/lib/ai-team/types";
import { toApprovalView, type DecideApprovalResult } from "@/lib/ai-team/approval-view";

const FINGERPRINT = /^[0-9a-f]{64}$/;

function answer(out: DecideCoreResult, ctx: ActionContext): DecideApprovalResult {
  const view = out.row ? toApprovalView(out.row, ctx.team, ctx.now) : null;
  if (out.ok && view) return { ok: true, view };
  return { ok: false, error: out.ok ? ctx.i18n.home("aiApprovals.errors.failed") : out.error, view };
}

/**
 * The owner's Approve / Decline on an AI-team proposal — from the Ask Mark
 * panel or the "Needs your approval" list on /home.
 *
 * Membership first (the org is the cookie's, checked); then everything else —
 * the action's own permission, expiry, re-checking that what the card showed
 * (`input.fingerprint`) is still what would be sent, the claim that makes a
 * double click execute once, the send and its real outcome — is
 * `decideApprovalCore`. Runs on the caller's RLS client, so the database's
 * own policies stand behind every check here.
 */
export async function decideApproval(
  id: string,
  decision: "approve" | "decline",
  input?: { message?: string; fingerprint?: string },
): Promise<DecideApprovalResult> {
  const access = await requireOrgMember();
  if (!access.ok) return { ok: false, error: access.error, view: null };
  if ((decision !== "approve" && decision !== "decline") || typeof id !== "string") {
    const t = await getServerT("home");
    return { ok: false, error: t("aiApprovals.errors.failed"), view: null };
  }

  const db = await createClient();
  const ctx = await buildActionContext({ db, orgId: access.orgId, userId: access.userId, role: access.role });
  const edits = input && typeof input.message === "string" ? { message: input.message.slice(0, 5000) } : undefined;
  const fingerprint = input && typeof input.fingerprint === "string" && FINGERPRINT.test(input.fingerprint) ? input.fingerprint : null;

  const out = await decideApprovalCore(ctx, id, decision, { edits, fingerprint }, defaultDecideDeps);
  revalidatePath("/home");
  return answer(out, ctx);
}

/**
 * Dismiss an approved send that never reported back — we couldn't confirm
 * whether it reached the customer, so it is closed, never retried.
 */
export async function dismissUnconfirmedApproval(id: string): Promise<DecideApprovalResult> {
  const access = await requireOrgMember();
  if (!access.ok) return { ok: false, error: access.error, view: null };
  if (typeof id !== "string") {
    const t = await getServerT("home");
    return { ok: false, error: t("aiApprovals.errors.failed"), view: null };
  }

  const db = await createClient();
  const ctx = await buildActionContext({ db, orgId: access.orgId, userId: access.userId, role: access.role });
  const out = await dismissUnconfirmedCore(ctx, id, defaultDecideDeps);
  revalidatePath("/home");
  return answer(out, ctx);
}

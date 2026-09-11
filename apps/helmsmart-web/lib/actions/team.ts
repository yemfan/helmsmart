"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { assertCanManageTeam, assertCanModifyMember } from "@helm/dna-people";
import { intlLocale } from "@leadsmart/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { translatorFor } from "@/lib/i18n/translator";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { isInvitee } from "@/lib/team-invitations";

type Role = "admin" | "bookkeeper" | "viewer";

/**
 * Translator for the errors the Settings → Team screen shows.
 *
 * Bound with `translatorFor` — the same way the invite email below binds
 * `emails` — so this file has ONE way of naming a namespace. Mixing that with
 * the request-scoped server translator would leave every unqualified `t("…")`
 * here ambiguous about which namespace it belongs to.
 */
async function settingsT() {
  return translatorFor(await getServerLocale(), "settings");
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getOrgAndUser() {
  const orgId = (await getMemberOrgId()) ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!orgId || !user) {
    const st = await settingsT();
    throw new Error(st("team.errors.notAuthenticated"));
  }
  return { orgId, userId: user.id, supabase };
}

async function assertAdminOrOwner(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, userId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();
  assertCanManageTeam(data?.role);
}

// ─── List members + pending invitations ──────────────────────────────────────

export async function getTeamMembers() {
  const { orgId, supabase } = await getOrgAndUser();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, role, joined_at, user:user_id(id, email, raw_user_meta_data)")
      .eq("organization_id", orgId)
      .order("joined_at"),
    supabase
      .from("team_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return { members: members ?? [], invitations: invitations ?? [] };
}

// ─── Invite member ────────────────────────────────────────────────────────────

export async function inviteMember(email: string, role: Role) {
  const { orgId, userId, supabase } = await getOrgAndUser();
  await assertAdminOrOwner(supabase, orgId, userId);

  // Look up org name for the email
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const orgName = org?.name ?? "HelmSmart";

  // Check for existing active invite
  const { data: existing } = await supabase
    .from("team_invitations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    const st = await settingsT();
    throw new Error(st("team.errors.invitePending"));
  }

  // Create invitation
  const { data: invite, error } = await supabase
    .from("team_invitations")
    .insert({
      organization_id: orgId,
      invited_by: userId,
      email: email.toLowerCase(),
      role,
    })
    .select("token")
    .single();

  if (error || !invite) {
    const st = await settingsT();
    throw new Error(error?.message ?? st("team.errors.inviteFailed"));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helmsmart.ai";
  const acceptUrl = `${appUrl}/join/${invite.token}`;

  // LANGUAGE OF THE INVITE. The person being invited has no account yet, so
  // there is no `user_preferences.ui_locale` to read — the only stored
  // preference in play is the admin's, who is sending this from a screen they
  // chose the language of. An owner working in Chinese is inviting a colleague
  // who reads Chinese, so their locale is the best answer available.
  const locale = await getServerLocale();
  const t = translatorFor(locale, "emails");
  const roleLabel = t(`invite.roles.${role}`);

  // Send invitation email
  await sendEmail({
    fromName: t("invite.fromName", { org: orgName }),
    to: email,
    subject: t("invite.subject", { org: orgName }),
    html: `<!DOCTYPE html>
<html lang="${intlLocale(locale)}"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#4f46e5;padding:20px 40px">
          <span style="font-size:16px;font-weight:700;color:#fff">HelmSmart</span>
        </td></tr>
        <tr><td style="padding:32px 40px">
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e293b">${t("invite.heading")}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
            ${t("invite.body", { org: orgName, role: roleLabel })}
          </p>
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">
            ${t("invite.accept")}
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            ${t("invite.expiry")}
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">${t("invite.footer")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: [
      t("invite.text.body", { org: orgName, role: roleLabel }),
      "",
      t("invite.text.accept", { url: acceptUrl }),
      "",
      t("invite.text.expiry"),
    ].join("\n"),
  });

  revalidatePath("/settings/team");
}

// ─── Revoke invitation ────────────────────────────────────────────────────────

export async function revokeInvitation(invitationId: string) {
  const { orgId, userId, supabase } = await getOrgAndUser();
  await assertAdminOrOwner(supabase, orgId, userId);

  const { error } = await supabase
    .from("team_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

// ─── Update member role ───────────────────────────────────────────────────────

export async function updateMemberRole(memberId: string, role: Role) {
  const { orgId, userId, supabase } = await getOrgAndUser();
  await assertAdminOrOwner(supabase, orgId, userId);

  // Prevent changing the owner's role
  const { data: target } = await supabase
    .from("organization_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .single();

  if (!target) {
    const st = await settingsT();
    throw new Error(st("team.errors.memberNotFound"));
  }
  assertCanModifyMember({
    targetRole: target.role,
    targetUserId: target.user_id,
    actorUserId: userId,
    action: "change_role",
  });

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

// ─── Remove member ────────────────────────────────────────────────────────────

export async function removeMember(memberId: string) {
  const { orgId, userId, supabase } = await getOrgAndUser();
  await assertAdminOrOwner(supabase, orgId, userId);

  const { data: target } = await supabase
    .from("organization_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .single();

  if (!target) {
    const st = await settingsT();
    throw new Error(st("team.errors.memberNotFound"));
  }
  assertCanModifyMember({
    targetRole: target.role,
    targetUserId: target.user_id,
    actorUserId: userId,
    action: "remove",
  });

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

// ─── Accept invitation (called from /join/[token] page) ──────────────────────

export type AcceptInvitationResult =
  | { ok: true; orgId: string; orgName: string }
  | { ok: false; error: string };

/**
 * Join the org an invitation is for — only as the person it was sent to.
 *
 * Holding the link is not enough: the signed-in account's email must be the
 * invitation's (`isInvitee`), and confirmed, since an address nobody has proved
 * they own proves nothing. A refusal writes nothing, so the invitation stays
 * pending in Settings → Team, where the owner can revoke it and invite the
 * right address.
 *
 * Refusals are returned rather than thrown: Next.js replaces a thrown action
 * error's message in production, so a thrown reason never reaches the page.
 * They are in the VISITOR's language, the same locale `/join/[token]` renders
 * in — the invitee has no stored preference yet.
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const t = translatorFor(await getServerLocale(), "public");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("join.accept.errors.signIn") };

  // Use service client for the token lookup (invitations table is RLS-restricted to admins)
  const serviceSb = await createServiceClient();

  const { data: invite } = await serviceSb
    .from("team_invitations")
    .select("id, organization_id, role, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { ok: false, error: t("join.error.invalid.body") };
  if (invite.accepted_at) return { ok: false, error: t("join.error.accepted.body") };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: t("join.error.expired.body") };

  if (!isInvitee(invite.email, user.email)) {
    return {
      ok: false,
      error: t("join.wrongAccount.body", { invited: invite.email, current: user.email ?? "" }),
    };
  }
  if (!user.email_confirmed_at) return { ok: false, error: t("join.accept.errors.unconfirmed") };

  // Add member
  const { error: memberError } = await serviceSb
    .from("organization_members")
    .insert({
      organization_id: invite.organization_id,
      user_id: user.id,
      role: invite.role,
      invited_by: null,
    })
    .select()
    .single();

  // Ignore duplicate (already a member)
  if (memberError && memberError.code !== "23505" && !memberError.message.includes("duplicate")) {
    console.error("[team] accept invitation: member insert failed:", memberError.message);
    return { ok: false, error: t("join.accept.error") };
  }

  // Mark accepted
  await serviceSb
    .from("team_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("accepted_at", null);

  // Look up org name
  const { data: org } = await serviceSb
    .from("organizations")
    .select("name")
    .eq("id", invite.organization_id)
    .single();

  return { ok: true, orgId: invite.organization_id, orgName: org?.name ?? "HelmSmart" };
}

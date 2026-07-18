"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { assertCanManageTeam, assertCanModifyMember } from "@helm/dna-people";

type Role = "admin" | "bookkeeper" | "viewer";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getOrgAndUser() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!orgId || !user) throw new Error("Not authenticated");
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

  if (existing) throw new Error("An active invitation is already pending for this email");

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

  if (error || !invite) throw new Error(error?.message ?? "Failed to create invitation");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helmsmart.ai";
  const acceptUrl = `${appUrl}/join/${invite.token}`;
  // Send invitation email
  await sendEmail({
    fromName: `${orgName} via HelmSmart`,
    to: email,
    subject: `You've been invited to join ${orgName} on HelmSmart`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#4f46e5;padding:20px 40px">
          <span style="font-size:16px;font-weight:700;color:#fff">HelmSmart</span>
        </td></tr>
        <tr><td style="padding:32px 40px">
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e293b">You're invited!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
            <strong>${orgName}</strong> has invited you to join their workspace on HelmSmart as a <strong>${role}</strong>.
          </p>
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">
            Accept invitation
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            This invitation expires in 7 days. If you weren't expecting this, you can ignore this email.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Powered by HelmSmart</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: `You've been invited to join ${orgName} on HelmSmart as a ${role}.\n\nAccept here: ${acceptUrl}\n\nThis link expires in 7 days.`,
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

  if (!target) throw new Error("Member not found");
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

  if (!target) throw new Error("Member not found");
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

export async function acceptInvitation(token: string): Promise<{ orgId: string; orgName: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to accept an invitation");

  // Use service client for the token lookup (invitations table is RLS-restricted to admins)
  const serviceSb = await createServiceClient();

  const { data: invite } = await serviceSb
    .from("team_invitations")
    .select("id, organization_id, role, email, expires_at, accepted_at")
    .eq("token", token)
    .single();

  if (!invite) throw new Error("Invitation not found or already used");
  if (invite.accepted_at) throw new Error("This invitation has already been accepted");
  if (new Date(invite.expires_at) < new Date()) throw new Error("This invitation has expired");

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
  if (memberError && !memberError.message.includes("duplicate")) {
    throw new Error(memberError.message);
  }

  // Mark accepted
  await serviceSb
    .from("team_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  // Look up org name
  const { data: org } = await serviceSb
    .from("organizations")
    .select("name")
    .eq("id", invite.organization_id)
    .single();

  return { orgId: invite.organization_id, orgName: org?.name ?? "HelmSmart" };
}

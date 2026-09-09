import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { getTeamMembers } from "@/lib/actions/team";
import { InviteForm } from "./invite-form";
import { RoleSelector, RemoveMemberButton, RevokeInviteButton } from "./team-actions";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("settings");
  return { title: t("meta.team") };
}

const ROLE_COLORS: Record<string, string> = {
  owner:      "bg-indigo-100 text-indigo-700",
  admin:      "bg-violet-100 text-violet-700",
  bookkeeper: "bg-sky-100 text-sky-700",
  viewer:     "bg-slate-100 text-slate-600",
};

export default async function TeamPage() {
  const t = await getServerT("settings");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ members, invitations }, { data: { user } }, { data: myMembership }] = await Promise.all([
    getTeamMembers(),
    supabase.auth.getUser(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single(),
  ]);

  const isAdminOrOwner = myMembership?.role === "owner" || myMembership?.role === "admin";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("team.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("team.subtitle")}</p>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("team.backToSettings")}
        </Link>
      </div>

      <div className="space-y-6">
        {/* Invite form — only for admins/owners */}
        {isAdminOrOwner && <InviteForm />}

        {/* Active members */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">
              {t("team.membersTitle")} <span className="text-slate-400 font-normal ml-1">({members.length})</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {members.map((m) => {
              const memberUser = m.user as unknown as { id: string; email: string; raw_user_meta_data: { full_name?: string } } | null;
              const email = memberUser?.email ?? t("team.unknownUser");
              const name  = memberUser?.raw_user_meta_data?.full_name;
              const isMe  = memberUser?.id === user?.id;
              const isOwner = m.role === "owner";

              return (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold flex-shrink-0">
                    {(name ?? email)[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {name ?? email}
                      </p>
                      {isMe && (
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {t("team.you")}
                        </span>
                      )}
                    </div>
                    {name && (
                      <p className="text-xs text-slate-400 truncate">{email}</p>
                    )}
                  </div>

                  {/* Role */}
                  {isAdminOrOwner && !isOwner && !isMe ? (
                    <RoleSelector
                      memberId={m.id}
                      currentRole={m.role}
                      disabled={false}
                    />
                  ) : (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role] ?? ROLE_COLORS.viewer}`}>
                      {t(`team.roles.${m.role}`, { defaultValue: m.role })}
                    </span>
                  )}

                  {/* Remove */}
                  {isAdminOrOwner && !isOwner && !isMe && (
                    <RemoveMemberButton memberId={m.id} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-800">
                {t("team.pendingTitle")} <span className="text-slate-400 font-normal ml-1">({invitations.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-50">
              {invitations.map((inv) => {
                const expires = new Date(inv.expires_at);
                const daysLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));

                return (
                  <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-sm font-semibold flex-shrink-0">
                      {inv.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{inv.email}</p>
                      <p className="text-xs text-slate-400">
                        {t("team.invitedAs", {
                          role: t(`team.roles.${inv.role}`, { defaultValue: inv.role }),
                          days: daysLeft,
                        })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.viewer}`}>
                      {t(`team.roles.${inv.role}`, { defaultValue: inv.role })}
                    </span>
                    {isAdminOrOwner && (
                      <RevokeInviteButton invitationId={inv.id} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { getUnreadCount, getRecentNotifications } from "@/lib/actions/notifications";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelmSmartAiPanel } from "@/components/helmsmart-ai-panel";
import { getActivePack } from "@/lib/packs";
import { markAvatarId } from "@/lib/mark-avatar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";

  const supabase = await createClient();

  // Load notification data + current user email server-side, and Mark's avatar
  // for the Ask Mark panel (RLS-scoped; falls back to his roster default).
  const [unreadCount, notifications, { data: { user } }, markAvatar] = await Promise.all([
    getUnreadCount(orgId),
    getRecentNotifications(orgId, 20),
    supabase.auth.getUser(),
    orgId ? markAvatarId(supabase, orgId) : Promise.resolve(null),
  ]);

  const pack = await getActivePack();

  return (
    // Below `lg` the sidebar is a top bar with a drawer, so the shell stacks.
    <div className="flex flex-col lg:flex-row h-dvh lg:h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        unreadCount={unreadCount}
        userEmail={user?.email ?? null}
        avatarUrl={(user?.user_metadata?.avatar_url as string | undefined) ?? null}
        productName={pack.productName}
        logoLetter={pack.logoLetter}
        terms={pack.terms}
        askMarkAvatar={markAvatar}
        notificationsSlot={
          <NotificationsBell
            orgId={orgId}
            initialCount={unreadCount}
            initialNotifications={notifications as Parameters<typeof NotificationsBell>[0]["initialNotifications"]}
          />
        }
      />
      <main id="main-content" className="flex-1 min-w-0 min-h-0 overflow-auto">
        {children}
      </main>
      {/* Ask Mark — the one panel; the sidebar button, the launcher, the shortcut and /ask all open it. */}
      {markAvatar ? <HelmSmartAiPanel markAvatar={markAvatar} /> : null}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { PremiumSidebar, PremiumTopbar } from "@repo/ui";
import navConfig, { leadSmartNav } from "@/nav.config";

const APP_NAME = "RealtyBoss";

/**
 * RealtyBoss layout using `PremiumSidebar` + `PremiumTopbar` from `@repo/ui`.
 * For production dashboard chrome (tokens, notifications, real auth menu), use `DashboardShell` instead.
 */
export default function LeadSmartShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/70 text-slate-900 md:flex md:min-h-screen md:flex-row">
      <PremiumSidebar
        appName={APP_NAME}
        sections={leadSmartNav}
        workspaceLabel={navConfig.sidebarTitle ?? "Workspace"}
        footer={
          <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-3 py-2.5 text-sm leading-snug text-white shadow-lg shadow-slate-900/25 ring-1 ring-white/10">
            <p className="font-medium text-white/95">Grow with AI follow-ups</p>
            <p className="mt-0.5 text-xs text-white/70">Upgrade for more credits and automation.</p>
          </div>
        }
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PremiumTopbar
          appName={APP_NAME}
          sections={leadSmartNav}
          searchPlaceholder="Search leads, clients, addresses..."
          creditsLabel="124 Credits"
          notificationHref="/dashboard/notifications"
          rightActions={[]}
          profileProfileHref="/dashboard"
          profileSettingsHref="/dashboard/settings"
          profileBillingHref="/agent/pricing"
          profileBillingLabel="Billing & credits"
          profileName="Michael Ye"
          profileEmail="Broker Admin"
        />

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

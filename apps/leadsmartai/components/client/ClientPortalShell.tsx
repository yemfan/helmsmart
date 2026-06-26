"use client";

import RequireAuthGate from "@/components/RequireAuthGate";
import ClientMobileNav from "@/components/client/ClientMobileNav";

export default function ClientPortalShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuthGate>
      <div className="min-h-dvh bg-slate-100 text-slate-900 pb-20">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">RealtyBoss</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Client
            </span>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4">{children}</main>
        <ClientMobileNav />
      </div>
    </RequireAuthGate>
  );
}

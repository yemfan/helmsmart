import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { isRedirectError } from "@/lib/isRedirectError";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import FinancialServicesSidebar from "./FinancialServicesSidebar";
import { getServerT } from "@/lib/i18n/server";

/**
 * Auth gate + sectioned-sidebar shell for the financial-services workspace.
 *
 * Uses a finance-specific sidebar (FinancialServicesSidebar) with MLM/IMO
 * terminology — Sit-Downs, BPMs, Field Training, Dials, Downline, Overrides,
 * Production, Book of Business — rather than the generic real-estate CRM nav.
 * The sidebar tells the product story execs already recognize.
 *
 * Demo phase: any signed-in user can enter (no role check).
 * Pre-pilot: restrict to a `financial_advisor` role on `leadsmart_users.role`,
 * and gate the "MY TEAM" sidebar section to MD-tier+ via a role check.
 */
export default async function FinancialServicesDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getServerT();
  let email: string | null = null;

  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) redirect("/login?redirect=/financial-services/dashboard");
    email = userData.user.email ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/login?redirect=/financial-services/dashboard");
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        <FinancialServicesSidebar email={email} showTeamSection />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  );
}

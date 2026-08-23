import { redirect } from "next/navigation";
import {
  getCurrentUserWithRole,
  type AppRole,
  type CurrentUserWithRole,
} from "@/lib/auth/getCurrentUser";
import { hasAgentWorkspaceAccess } from "@/lib/entitlements/agentAccess";
import { supabaseServerClient } from "@/lib/supabaseServerClient";

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "").toLowerCase().trim();
}

function roleInAllowed(role: string | null, allowed: AppRole[]): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return allowed.some((a) => normalizeRole(a) === r);
}

/**
 * App Router guard: `getCurrentUserWithRole` + LeadSmart AI Agent entitlement when `"agent"` is in
 * `allowed`. Import from this module (not `@/lib/auth/requireRole`, which uses `fetchUserPortalContext`).
 *
 * @example
 * import { requireRole } from "@/lib/auth/requireAppRole";
 */
export async function requireRole(allowed: AppRole[]): Promise<CurrentUserWithRole> {
  const user = await getCurrentUserWithRole();

  if (!user) {
    redirect("/login");
  }

  if (allowed.map((a) => normalizeRole(a)).includes("agent")) {
    const hasAccess = await hasAgentWorkspaceAccess(
      supabaseServerClient(),
      user.id,
      user.role
    );

    if (hasAccess) {
      return user;
    }

    if (!roleInAllowed(user.role, allowed)) {
      redirect("/start-free/agent");
    }

    redirect("/start-free/agent");
  }

  if (!roleInAllowed(user.role, allowed)) {
    redirect("/unauthorized");
  }

  return user;
}

/** Alias for `requireRole` in this file */
export const requireAppRole = requireRole;

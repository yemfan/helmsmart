/**
 * RoleGuard — server component that shows a read-only banner when the
 * current user lacks a specific permission. Used at the top of write pages.
 *
 * Usage (Server Component):
 *   <RoleGuard permission="invoices.write" />
 *   // rest of page form — the form won't be shown if access denied,
 *   // or a banner appears to explain the restriction
 */

import { getMyRole, hasPermission, type Permission } from "@/lib/rbac";
import { getServerT } from "@/lib/i18n/server";
import { Lock } from "lucide-react";

interface Props {
  permission: Permission;
  /** If true, render nothing instead of a banner when access is denied */
  silent?: boolean;
}

export async function RoleGuard({ permission, silent = false }: Props) {
  const role = await getMyRole();
  if (!role || !hasPermission(role, permission)) {
    if (silent) return null;
    // `common`, not a surface namespace: this banner sits at the top of write
    // pages across Books, Clients, Marketing and Settings alike.
    const t = await getServerT("common");
    return (
      <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">{t("permission.readOnlyTitle")}</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {/* One sentence, one key: the role name is interpolated rather than
                spliced between two half-strings, because the word order around
                it differs by language. */}
            {t("permission.readOnlyBody", { role: t(`roles.${role ?? "unknown"}`) })}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Check permission in a server action — returns error payload if denied.
 * Use at the top of write server actions.
 *
 * Usage:
 *   const denied = await checkActionPermission("invoices.write");
 *   if (denied) return denied;
 */
export async function checkActionPermission(
  permission: Permission
): Promise<{ ok: false; error: string } | null> {
  const role = await getMyRole();
  if (!role || !hasPermission(role, permission)) {
    /*
     * The old message named the permission id — `Permission denied — requires
     * invoices.write`. That is our vocabulary, not the owner's, and it told
     * them nothing they could act on. This says what happened and who can
     * change it, in their language. Server actions run inside a request, so
     * `getServerT` resolves the reader's locale here just as it does on a page.
     */
    const t = await getServerT("common");
    return { ok: false, error: t("permission.denied") };
  }
  return null;
}

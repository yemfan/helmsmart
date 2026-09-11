/**
 * Roles and what each may do — the pure half of `lib/rbac.ts`.
 *
 * Split out so code that only needs to ASK (the AI team's action runner, its
 * approval decisions, their tests) does not import the membership lookup and
 * its `server-only` / `next/headers` graph. `lib/rbac.ts` re-exports all of
 * it; the matrix is documented there.
 */

export type OrgRole = "owner" | "admin" | "bookkeeper" | "viewer";

export type Permission =
  | "settings.read"
  | "settings.write"
  | "team.manage"
  | "clients.write"
  | "clients.read"
  | "invoices.write"
  | "invoices.read"
  | "books.write"
  | "books.read"
  | "pipeline.write"
  | "pipeline.read"
  | "forms.write"
  | "campaigns.write"
  | "reports.read";

const ROLE_PERMISSIONS: Record<OrgRole, Set<Permission>> = {
  owner: new Set([
    "settings.read", "settings.write", "team.manage",
    "clients.write", "clients.read",
    "invoices.write", "invoices.read",
    "books.write", "books.read",
    "pipeline.write", "pipeline.read",
    "forms.write", "campaigns.write",
    "reports.read",
  ]),
  admin: new Set([
    "settings.read", "settings.write", "team.manage",
    "clients.write", "clients.read",
    "invoices.write", "invoices.read",
    "books.write", "books.read",
    "pipeline.write", "pipeline.read",
    "forms.write", "campaigns.write",
    "reports.read",
  ]),
  bookkeeper: new Set([
    "clients.read",
    "invoices.write", "invoices.read",
    "books.write", "books.read",
    "pipeline.read",
    "reports.read",
  ]),
  viewer: new Set([
    "clients.read",
    "invoices.read",
    "books.read",
    "pipeline.read",
    "reports.read",
  ]),
};

/**
 * Check if a role has a specific permission.
 * Pure utility — no DB call needed.
 */
export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

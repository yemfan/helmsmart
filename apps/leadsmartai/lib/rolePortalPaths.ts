/**
 * Role → portal hub + post-login dashboard URLs (client-safe; keep in sync with `rolePortalServer.ts`).
 */
export const BROKER_PORTAL_ROLES = new Set([
  "broker",
  "broker_owner",
  "managing_broker",
  "team_lead",
  "brokerage_admin",
  "owner",
  "partner",
]);

/**
 * Agent workspace upsells (sidebar promo, Upgrade CTA) — not for consumers, admins, or support.
 */
export function isAgentOrBrokerProfileRole(role: string | null | undefined): boolean {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
  if (r === "agent") return true;
  return BROKER_PORTAL_ROLES.has(r);
}

/** Platform operators — no customer pricing, upgrades, or promos. */
export function isAdminOrSupportRole(role: string | null | undefined): boolean {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
  return r === "admin" || r === "support";
}

export type PortalKind = "admin" | "broker" | "agent";

/**
 * Agents' default landing — "Ask Max", the conversational command center. This
 * is where every agent lands after login / "Dashboard" in the account menu; the
 * classic overview + the rest of the CRM stay reachable from the nav. Making
 * Max the home is the "goals, not features" front door.
 */
export const DASHBOARD_HOME_PATH = "/dashboard/boss";

/** Brokerage leadership dashboard (same CRM shell; brokerage-focused home). */
export const BROKER_DASHBOARD_PATH = "/dashboard/broker";

/** Support / platform ops — does not require an `agents` row. */
export const ADMIN_SUPPORT_HOME_PATH = "/admin/support";

/** Agent hub shell (platform dashboard) — requires `agent` or `admin` role. */
export const AGENT_DASHBOARD_HOME_PATH = "/agent/dashboard";

/** Conversion page for signed-in users who need an agent workspace. */
export const START_FREE_AGENT_PATH = "/start-free/agent";

/** Strict RBAC denial (admin/support-only areas). */
export const UNAUTHORIZED_PATH = "/unauthorized";


/**
 * Where to send a signed-in professional after login / “Dashboard” in account menu.
 * (Hub pages `/agent`, `/broker`, `/admin` are link indexes only — not the main work surface.)
 */
export function resolveRoleHomePath(role: string | null | undefined, _hasAgentRow: boolean): string {
  const r = String(role ?? "").toLowerCase().trim();
  if (r === "admin" || r === "support") return ADMIN_SUPPORT_HOME_PATH;
  if (BROKER_PORTAL_ROLES.has(r)) return BROKER_DASHBOARD_PATH;
  return DASHBOARD_HOME_PATH;
}

/** Whether `role` may access the `/agent`, `/broker`, or `/admin` hub + layout tree. */
export function matchesPortalKind(role: string | null | undefined, kind: PortalKind): boolean {
  const r = String(role ?? "").toLowerCase().trim();
  if (kind === "admin") {
    return r === "admin" || r === "support";
  }
  if (kind === "broker") {
    return BROKER_PORTAL_ROLES.has(r);
  }
  // Agent portal: everyone else with CRM access (not admin/support/broker)
  if (r === "admin" || r === "support") return false;
  if (BROKER_PORTAL_ROLES.has(r)) return false;
  return true;
}

/**
 * Legacy hub path (`/agent` | `/broker` | `/admin`) for portal index pages and deep links.
 */
export function getProfessionalPortalPath(
  role: string | null | undefined,
  _hasAgentRow: boolean
): `/${PortalKind}` {
  const r = String(role ?? "").toLowerCase().trim();
  if (r === "admin" || r === "support") return "/admin";
  if (BROKER_PORTAL_ROLES.has(r)) return "/broker";
  return "/agent";
}

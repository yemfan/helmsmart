/**
 * Drop the Team row from a sidebar when this person should not see it.
 *
 * No imports on purpose: the sidebar, the phone drawer and the command
 * palette are client components, and a helper that pulled in server code
 * took production down once (#1655). The decision is made on the server
 * (visibility.ts) and arrives here as a boolean.
 */

export const TEAM_NAV_HREF = "/dashboard/team";

export function hideTeamNav<T>(sections: readonly T[], show: boolean): T[] {
  if (show) return [...sections];
  return sections
    .filter((s) => (s as { href?: unknown }).href !== TEAM_NAV_HREF)
    .map((s) => {
      const items = (s as { items?: unknown }).items;
      if (!Array.isArray(items)) return s;
      return { ...(s as object), items: items.filter((i) => (i as { href?: unknown }).href !== TEAM_NAV_HREF) } as T;
    });
}

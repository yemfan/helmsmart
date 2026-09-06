/**
 * The tools a hub may offer its visitors.
 *
 * A catalog, not a copy of the calculators: every entry points at a page that
 * already exists and works signed-out. The two that capture leads
 * (`home_value`, `find_home`) point at hub-owned routes so the lead lands in
 * THIS agent's CRM; the calculators are pure client pages with nothing to
 * attribute beyond the `tool_opened` event the hub records on click.
 *
 * Deliberately absent: `/ai-real-estate-deal-analyzer`, `/ai-cma-analyzer`
 * and `/rental-property-analyzer`, which render a sign-in gate to a stranger.
 * A tool the visitor cannot use is not a tool, it is a broken promise.
 *
 * Copy lives in i18n under `hub.tools.<key>` so a Chinese-speaking visitor
 * reads the tool names in Chinese. Pure: no I/O.
 */

export type HubToolIcon =
  | "home"
  | "calculator"
  | "wallet"
  | "receipt"
  | "scale"
  | "piggy-bank"
  | "trending-up"
  | "percent"
  | "bar-chart"
  | "search"
  | "refresh";

export type HubTool = {
  key: string;
  /** Route relative to the site. `{username}` is substituted for hub-owned flows. */
  href: string;
  icon: HubToolIcon;
  /** True when using the tool creates a lead for the agent. */
  capturesLead: boolean;
  /** Section grouping for the editor. */
  group: "seller" | "buyer" | "investor";
};

export const HUB_TOOLS: readonly HubTool[] = [
  { key: "home_value", href: "/@{username}/home-value", icon: "home", capturesLead: true, group: "seller" },
  { key: "find_home", href: "/homes?agent={username}", icon: "search", capturesLead: true, group: "buyer" },
  { key: "mortgage", href: "/mortgage-calculator", icon: "calculator", capturesLead: false, group: "buyer" },
  { key: "affordability", href: "/affordability-calculator", icon: "wallet", capturesLead: false, group: "buyer" },
  { key: "down_payment", href: "/down-payment-calculator", icon: "piggy-bank", capturesLead: false, group: "buyer" },
  { key: "closing_cost", href: "/closing-cost-estimator", icon: "receipt", capturesLead: false, group: "buyer" },
  { key: "rent_vs_buy", href: "/rent-vs-buy-calculator", icon: "scale", capturesLead: false, group: "buyer" },
  { key: "refinance", href: "/refinance-calculator", icon: "refresh", capturesLead: false, group: "buyer" },
  { key: "cash_flow", href: "/cash-flow-calculator", icon: "trending-up", capturesLead: false, group: "investor" },
  { key: "cap_rate_roi", href: "/cap-rate-calculator", icon: "percent", capturesLead: false, group: "investor" },
  { key: "roi", href: "/roi-calculator", icon: "bar-chart", capturesLead: false, group: "investor" },
  { key: "investment_analyzer", href: "/property-investment-analyzer", icon: "bar-chart", capturesLead: false, group: "investor" },
] as const;

const BY_KEY: ReadonlyMap<string, HubTool> = new Map(HUB_TOOLS.map((t) => [t.key, t]));

export function hubTool(key: string): HubTool | null {
  return BY_KEY.get(key) ?? null;
}

export function isHubToolKey(key: unknown): key is string {
  return typeof key === "string" && BY_KEY.has(key);
}

/** Resolve an ordered key list to tools, dropping anything unknown and any duplicate. */
export function resolveHubTools(keys: readonly string[]): HubTool[] {
  const seen = new Set<string>();
  const out: HubTool[] = [];
  for (const key of keys) {
    const tool = BY_KEY.get(key);
    if (!tool || seen.has(key)) continue;
    seen.add(key);
    out.push(tool);
  }
  return out;
}

/** The href for a tool on a given hub. */
export function hubToolHref(tool: HubTool, username: string): string {
  return tool.href.replace("{username}", encodeURIComponent(username));
}

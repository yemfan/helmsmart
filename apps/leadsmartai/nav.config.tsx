import type { NavConfig, NavSection } from "@repo/ui";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Compass,
  CreditCard,
  Eye,
  FileSignature,
  Globe,
  Handshake,
  CircleQuestionMark,
  Headphones,
  House,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Receipt,
  Rocket,
  Route,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { TEAM_ACTIONS } from "./lib/team-actions";

const STROKE = 1.75;

/** Group-row icon (17px). */
function p(icon: ReactNode): ReactNode {
  return icon;
}
/** Leaf-row icon (14px). */
function l(icon: ReactNode): ReactNode {
  return icon;
}

/**
 * CloseBoss — agent portal sidebar.
 *
 * Structure per the theme constitution's preferred navigation (and the
 * user's spec):
 *
 *   Boss Assistant · Calendar · Tasks · Leads · Transactions
 *   ──────
 *   Receptionist · Sales Assistant · Transaction Assistant · Accountant
 *   ──────
 *   More (collapsed — everything else stays reachable) · Settings
 *
 * Every feature that used to live in the Work/Engage/Analyze/Manage
 * bands kept its route; the long tail now lives in the collapsed
 * "More" group so the daily surface stays calm (constitution: the
 * software should not feel busy).
 */
const navConfig = {
  id: "leadsmart",
  sidebarTitle: "CloseBoss",
  sections: [
    /* ── The Boss's day ── */
    {
      label: "Ask Max",
      href: "/dashboard/boss",
      match: ["/dashboard", "/dashboard/boss", "/dashboard/broker"],
      icon: p(<House size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      // Shared by most of the team (Receptionist answers, Sales Assistant
      // follows up) — a common work row above the team, not under one agent.
      label: "Conversations",
      href: "/dashboard/inbox",
      match: ["/dashboard/inbox", "/dashboard/calls"],
      icon: p(<MessageCircle size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Tasks",
      href: "/dashboard/tasks",
      match: ["/dashboard/tasks"],
      icon: p(<CheckCircle2 size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      // Unified people hub — Smart Lists inside segment into Leads,
      // Sphere, All. Old /dashboard/leads + /dashboard/sphere redirect here.
      label: "Leads",
      href: "/dashboard/contacts",
      match: ["/dashboard/contacts", "/dashboard/leads", "/dashboard/sphere"],
      icon: p(<Users size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Calendar",
      href: "/dashboard/calendar",
      match: ["/dashboard/calendar"],
      icon: p(<Calendar size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      // Deal records hub — the listing → close lifecycle in stage order.
      // This is the OBJECT axis (the records the agent works); the AI-driven
      // work still lives under the assistants (Sales Assistant: CMA / Seller
      // Presentation; Transaction Assistant: Coordinator Board / Deal Coach).
      // Sits beside Leads: people hub + deals hub.
      label: "Deals",
      icon: p(<Handshake size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        {
          label: "Listings",
          href: "/dashboard/properties",
          match: ["/dashboard/properties"],
          icon: l(<House size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Showings",
          href: "/dashboard/showings",
          match: ["/dashboard/showings"],
          icon: l(<Eye size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Offers",
          href: "/dashboard/offers",
          match: ["/dashboard/offers"],
          icon: l(<FileSignature size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Transactions",
          href: "/dashboard/transactions",
          match: ["/dashboard/transactions"],
          icon: l(<KeyRound size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
    },
    /* ── Your AI Team — each employee shows Overview + Actions; the
       individual actions are nested inside the Actions page (the sidebar
       is 2 levels: a group and its items). ── */
    { kind: "divider" as const },
    { kind: "section-label" as const, label: "Your AI Team" },
    // Each assistant is ONE row. Its actions sit in a strip under the page
    // header (AssistantActionsStrip) and the long-tail /actions page stays
    // reachable from there — the Overview · Actions nesting cost a click on
    // every visit (2026-09 UX audit).
    {
      label: "Receptionist",
      href: "/dashboard/ai-receptionist",
      match: ["/dashboard/ai-receptionist", ...TEAM_ACTIONS.receptionist.actionMatch],
      icon: p(<Headphones size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Sales Assistant",
      href: "/dashboard/ai-sales-assistant",
      match: ["/dashboard/ai-sales-assistant", ...TEAM_ACTIONS.sales.actionMatch],
      icon: p(<TrendingUp size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      // Took demand generation over from the Sales Assistant: it CREATES
      // leads and keeps the Realtor visible; Sales converts.
      label: "Marketing Assistant",
      href: "/dashboard/ai-marketing-assistant",
      // match entries are EXACT paths (see @repo/ui matchPath.ts);
      // include the sphere deep-dives Marketing Plans owns.
      match: [
        "/dashboard/ai-marketing-assistant",
        ...TEAM_ACTIONS.marketing.actionMatch,
        "/dashboard/marketing",
        "/dashboard/sphere/monetization",
        "/dashboard/sphere/likely-buyers",
        "/dashboard/sphere/likely-sellers",
        "/dashboard/sphere/signals",
      ],
      icon: p(<Megaphone size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      // The agent's public page — the only outward-facing surface the
      // Marketing Assistant owns. Everything in its actions is something
      // the AI does; this is somewhere a stranger lands, so it keeps its
      // own row.
      label: "Marketing Hub",
      href: "/dashboard/hub",
      match: ["/dashboard/hub"],
      icon: p(<Globe size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Transaction Assistant",
      href: "/dashboard/ai-transaction-assistant",
      match: ["/dashboard/ai-transaction-assistant", ...TEAM_ACTIONS.transaction.actionMatch],
      icon: p(<ClipboardList size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Accountant",
      href: "/dashboard/ai-accountant",
      match: ["/dashboard/ai-accountant", ...TEAM_ACTIONS.accountant.actionMatch],
      icon: p(<Receipt size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Manage AI Team",
      href: "/dashboard/ai-team",
      match: ["/dashboard/ai-team"],
      icon: p(<Settings size={17} strokeWidth={STROKE} aria-hidden />),
    },

    /* ── Everything else, collapsed ── */
    { kind: "divider" as const },
    {
      // The Realtor's own tools — things the human does, not the AI
      // team. Anything an agent does for you lives under that agent.
      label: "More",
      icon: p(<Wrench size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        // Open Houses, Showings, and Listings (with Presentations) all
        // moved under the Sales Assistant.
        {
          label: "Sales Model",
          href: "/dashboard/sales-model",
          match: ["/dashboard/sales-model"],
          icon: l(<Target size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Playbooks",
          href: "/dashboard/playbooks",
          match: ["/dashboard/playbooks"],
          icon: l(<ClipboardList size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Playbook runs",
          href: "/dashboard/playbook-runs",
          match: ["/dashboard/playbook-runs"],
          icon: l(<Rocket size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Skills",
          href: "/dashboard/skills",
          match: ["/dashboard/skills"],
          icon: l(<Sparkles size={14} strokeWidth={STROKE} aria-hidden />),
        },
        // Daily Overview removed from the nav (the Boss Assistant IS
        // the daily overview now); route stays live at /dashboard/overview.
        // Performance merged into the Boss Assistant (collapsed
        // "Business performance" section); route redirects there.
        {
          label: "Coaching",
          href: "/dashboard/coaching",
          match: ["/dashboard/coaching"],
          icon: l(<Compass size={14} strokeWidth={STROKE} aria-hidden />),
        },
        // Sphere Monetization moved into Marketing Plans (Sphere tab).
        // Growth & Opportunities moved under the Sales Assistant.
        {
          label: "Property Tools",
          href: "/dashboard/tools",
          match: ["/dashboard/tools"],
          icon: l(<Wrench size={14} strokeWidth={STROKE} aria-hidden />),
        },
        // CMAs removed from the nav; route stays live at /dashboard/cma.
        {
          label: "Billing",
          href: "/dashboard/billing",
          match: ["/dashboard/billing"],
          icon: l(<CreditCard size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Ungated, unlike the staff Support inbox below: this is the agent-
          // facing help center, and it is the only help entry point in the nav.
          label: "Help & Guides",
          href: "/help",
          match: ["/help"],
          icon: l(<CircleQuestionMark size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Support staff inbox — hidden for non-staff roles.
          label: "Support",
          href: "/support",
          match: ["/support"],
          roles: ["admin", "support"],
          icon: l(<Headphones size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
    },

    /* ── Settings ── */
    {
      // Settings is an index of five groups; each group page keeps this row lit.
      label: "Settings",
      href: "/dashboard/settings",
      match: [
        "/dashboard/settings",
        "/dashboard/settings/account",
        "/dashboard/settings/ai-team",
        "/dashboard/settings/channels",
        "/dashboard/settings/messaging",
        "/dashboard/settings/data",
        "/account/profile",
      ],
      icon: p(<Settings size={17} strokeWidth={STROKE} aria-hidden />),
    },

    /* ── Admin (role-gated) ── */
    { kind: "divider" as const },
    {
      label: "Admin",
      icon: p(<LayoutDashboard size={17} strokeWidth={STROKE} aria-hidden />),
      roles: ["admin"],
      items: [
        {
          label: "Platform Overview",
          href: "/admin/platform-overview",
          roles: ["admin"],
          match: ["/admin/platform-overview"],
          icon: l(<LayoutDashboard size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Analytics",
          href: "/admin/founder",
          roles: ["admin"],
          match: ["/admin/founder"],
          icon: l(<BarChart3 size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Billing",
          href: "/admin/billing",
          roles: ["admin"],
          match: ["/admin/billing"],
          icon: l(<CreditCard size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Support Inbox",
          href: "/admin/support",
          roles: ["admin", "support"],
          match: ["/admin/support"],
          icon: l(<Headphones size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Lead Queue",
          href: "/admin/lead-queue",
          roles: ["admin", "support"],
          match: ["/admin/lead-queue"],
          icon: l(<ClipboardList size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Lead Routing",
          href: "/dashboard/admin/lead-routing",
          roles: ["admin"],
          match: ["/dashboard/admin/lead-routing"],
          icon: l(<Route size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
    },
  ],
} satisfies NavConfig;

export const leadSmartNav = navConfig.sections;

/** Pick top-level sections by label, in the given order, skipping any missing. */
function pick(...labels: string[]): NavSection[] {
  const all = navConfig.sections as NavSection[];
  return labels
    .map((label) => all.find((s) => "label" in s && s.label === label))
    .filter((s): s is NavSection => Boolean(s));
}

/**
 * Mobile drawer nav (Option B) — DERIVED from the desktop sections so the two
 * never drift. Condensed for a phone: only the daily-driver rows stay at the
 * top; the AI Team keeps its Overview/Actions groups; Leads + Deals drop BELOW
 * the team (out of the prime top slots) rather than competing up top.
 */
export const leadSmartMobileNav: NavSection[] = [
  ...pick("Ask Max", "Conversations", "Tasks", "Calendar"),
  { kind: "section-label", label: "Your AI Team" },
  ...pick(
    "Receptionist",
    "Sales Assistant",
    "Marketing Assistant",
    "Marketing Hub",
    "Transaction Assistant",
    "Accountant",
    "Manage AI Team",
  ),
  { kind: "divider" },
  ...pick("Leads", "Deals", "More", "Settings", "Admin"),
];

export { default as marketingNavConfig, leadSmartMarketingNav } from "./marketing.nav.config";

export default navConfig;

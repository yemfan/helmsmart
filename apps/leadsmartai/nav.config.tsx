import type { NavConfig } from "@repo/ui";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Compass,
  CreditCard,
  DoorOpen,
  Eye,
  FileSignature,
  Handshake,
  Headphones,
  House,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Megaphone,
  MessageCircle,
  PenLine,
  Presentation,
  Receipt,
  Rocket,
  Route,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

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
 * RealtyBoss — agent portal sidebar.
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
  sidebarTitle: "RealtyBoss",
  sections: [
    /* ── The Boss's day ── */
    {
      label: "Boss Assistant",
      href: "/dashboard/boss",
      match: ["/dashboard", "/dashboard/boss", "/dashboard/broker"],
      icon: p(<House size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Calendar",
      href: "/dashboard/calendar",
      match: ["/dashboard/calendar"],
      icon: p(<Calendar size={17} strokeWidth={STROKE} aria-hidden />),
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
    {
      // Shared by most of the team (Receptionist answers, Sales
      // Assistant follows up) — so it stays a common work row rather
      // than living under any single assistant.
      label: "Conversations",
      href: "/dashboard/inbox",
      match: ["/dashboard/inbox", "/dashboard/calls"],
      icon: p(<MessageCircle size={17} strokeWidth={STROKE} aria-hidden />),
    },

    /* ── Your AI Team — each agent groups the work IT does.
       Surfaces shared by most agents (Conversations) stay above. ── */
    { kind: "divider" as const },
    {
      // ONE page: every call (answered, missed + text-back, auto
      // call-backs), settings, and outbound tools all live on the
      // Receptionist page itself — no sub-pages.
      label: "Receptionist",
      href: "/dashboard/ai-receptionist",
      match: ["/dashboard/ai-receptionist", "/dashboard/missed-call"],
      icon: p(<Headphones size={17} strokeWidth={STROKE} aria-hidden />),
    },
    {
      label: "Sales Assistant",
      icon: p(<TrendingUp size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        {
          label: "Overview",
          href: "/dashboard/ai-sales-assistant",
          match: ["/dashboard/ai-sales-assistant"],
          icon: l(<TrendingUp size={14} strokeWidth={STROKE} aria-hidden />),
        },
        // Drafts moved under the Marketing Assistant — the approval
        // queue holds its sphere-nurture messages.
        {
          // Open houses feed the Sales Assistant's pipeline (sign-ins
          // become leads, follow-ups convert them).
          label: "Open Houses",
          href: "/dashboard/open-houses",
          match: ["/dashboard/open-houses", "/dashboard/open-house"],
          icon: l(<DoorOpen size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Buyer-side: AI house search the agent runs for buyers, then
          // emails the matches. Sits with the Sales Assistant's deal work.
          label: "House Search",
          href: "/dashboard/house-search",
          match: ["/dashboard/house-search"],
          icon: l(<Compass size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Buyer-decision deep report: value, affordability, deal rating,
          // ROI, schools, neighborhood, map. Pairs with House Search.
          label: "Deep Report",
          href: "/dashboard/deep-report",
          match: ["/dashboard/deep-report"],
          icon: l(<BarChart3 size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // The real comps/valuation CMA — price the home. Pairs with
          // Seller Presentation below (price it → pitch it → win it).
          label: "CMA",
          href: "/dashboard/cma",
          match: ["/dashboard/cma"],
          icon: l(<BarChart3 size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Win-the-listing pitch deck — reuses the AI CMA's valuation +
          // comps so pricing is consistent with the CMA. Single
          // consolidated generator; old /seller-presentation redirects here.
          label: "Seller Presentation",
          href: "/dashboard/presentations",
          match: ["/dashboard/presentations", "/dashboard/seller-presentation"],
          icon: l(<Presentation size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Pipeline insights — where the Sales Assistant's next
          // opportunities come from. ("Opportunities" dropped from the
          // label: /dashboard/opportunities is a different thing — the
          // paid Lead Marketplace.)
          label: "Growth",
          href: "/dashboard/growth",
          match: ["/dashboard/growth"],
          icon: l(<Rocket size={14} strokeWidth={STROKE} aria-hidden />),
        },
        // Lead Queue hidden for now (route stays live at
        // /dashboard/lead-queue) — restore by re-adding:
        // { label: "Lead Queue", href: "/dashboard/lead-queue",
        //   match: ["/dashboard/lead-queue"],
        //   icon: l(<ClipboardList .../>) }
      ],
    },
    {
      // Took demand generation over from the Sales Assistant: it
      // CREATES leads and keeps the Realtor visible; Sales converts.
      label: "Marketing Assistant",
      icon: p(<Megaphone size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        {
          label: "Overview",
          href: "/dashboard/ai-marketing-assistant",
          match: ["/dashboard/ai-marketing-assistant"],
          icon: l(<Megaphone size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Its approval queue — nurture messages drafted for the
          // sphere, waiting for the Boss to approve before they send.
          label: "Drafts",
          href: "/dashboard/drafts",
          match: ["/dashboard/drafts"],
          icon: l(<PenLine size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Hosts the Sphere tab too (sphere monetization + the
          // likely-seller/buyer deep dives stay highlighted here).
          label: "Marketing Plans",
          href: "/dashboard/marketing/plans",
          // match entries are EXACT paths (see @repo/ui matchPath.ts).
          match: [
            "/dashboard/marketing",
            "/dashboard/marketing/plans",
            "/dashboard/sphere/monetization",
            "/dashboard/sphere/likely-buyers",
            "/dashboard/sphere/likely-sellers",
            "/dashboard/sphere/signals",
          ],
          icon: l(<Route size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Templates",
          href: "/dashboard/templates",
          match: ["/dashboard/templates"],
          icon: l(<ClipboardList size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Generate Leads",
          href: "/dashboard/leads/generate",
          match: ["/dashboard/leads/generate"],
          icon: l(<Sparkles size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Which lead sources actually produce revenue — tells the
          // Realtor where to spend. Was built but unreachable.
          label: "Lead Source ROI",
          href: "/dashboard/lead-source-roi",
          match: ["/dashboard/lead-source-roi"],
          icon: l(<LineChart size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
    },
    {
      label: "Transaction Assistant",
      icon: p(<ClipboardList size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        {
          label: "Overview",
          href: "/dashboard/ai-transaction-assistant",
          match: ["/dashboard/ai-transaction-assistant"],
          icon: l(<ClipboardList size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Coordinator Board",
          href: "/dashboard/transactions/coordinator",
          match: ["/dashboard/transactions/coordinator"],
          icon: l(<LayoutGrid size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          // Per-deal AI coach (pricing, risk, negotiation scripts) — was
          // built but unreachable; lives with the deal-in-progress work.
          label: "Deal Coach",
          href: "/dashboard/deal-coach",
          match: ["/dashboard/deal-coach"],
          icon: l(<Handshake size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
    },
    {
      label: "Accountant",
      icon: p(<Receipt size={17} strokeWidth={STROKE} aria-hidden />),
      items: [
        {
          label: "Overview",
          href: "/dashboard/ai-accountant",
          match: ["/dashboard/ai-accountant"],
          icon: l(<Receipt size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Invoices",
          href: "/dashboard/books",
          match: ["/dashboard/books"],
          icon: l(<Receipt size={14} strokeWidth={STROKE} aria-hidden />),
        },
        {
          label: "Expenses",
          href: "/dashboard/expenses",
          match: ["/dashboard/expenses"],
          icon: l(<Wallet size={14} strokeWidth={STROKE} aria-hidden />),
        },
      ],
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
          label: "Profile",
          href: "/account/profile",
          match: ["/account/profile"],
          icon: l(<User size={14} strokeWidth={STROKE} aria-hidden />),
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
      label: "Settings",
      href: "/dashboard/settings",
      match: ["/dashboard/settings"],
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

export { default as marketingNavConfig, leadSmartMarketingNav } from "./marketing.nav.config";

export default navConfig;

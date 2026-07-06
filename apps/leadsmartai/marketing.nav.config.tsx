import type { NavConfig } from "@repo/ui";
import {
  ArrowRightLeft,
  BookOpen,
  Building2,
  Calculator,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  LifeBuoy,
  Mail,
  MessageCircle,
  MonitorPlay,
  Phone,
  Plug,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";

/**
 * Public marketing nav — top-nav-first.
 *
 * The desktop chrome was previously a left sidebar; visitors lost
 * 80% of the marketing horizontal space to a list of every public
 * route. This file is the new source of truth for the top-nav
 * groups:
 *
 *   Product  ·  Free tools  ·  Resources  ·  Compare  ·  Homes  ·  Pricing
 *
 * Groups (`items`) render as dropdowns on desktop and as collapsible
 * sections in the mobile drawer. Leaves render as direct links. The
 * legacy "Site / Calculators & estimators / Analyzers & AI" submenus
 * are gone — Free tools (/free-tools) now serves as the indexed
 * directory for the calculator + analyzer suite.
 */
const marketingNavConfig = {
  id: "leadsmart-marketing",
  sidebarTitle: "Menu",
  sections: [
    /* ── Product ── what LeadSmart AI actually is ── */
    {
      label: "Product",
      icon: <Sparkles size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: "Features", href: "/features", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: "Live demo", href: "/try-demo", icon: <MonitorPlay size={16} strokeWidth={2} aria-hidden /> },
        { label: "Test-drive voice AI", href: "/voice-ai-test-drive", icon: <Phone size={16} strokeWidth={2} aria-hidden /> },
        { label: "Integrations", href: "/integrations", icon: <Plug size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Free tools ── top-of-funnel lead magnets ── */
    {
      label: "Free tools",
      icon: <Wand2 size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: "All free tools", href: "/free-tools", icon: <Wand2 size={16} strokeWidth={2} aria-hidden /> },
        { label: "Mortgage Calculator", href: "/mortgage-calculator", icon: <Calculator size={16} strokeWidth={2} aria-hidden /> },
        { label: "Cap Rate Calculator", href: "/cap-rate-calculator", icon: <Calculator size={16} strokeWidth={2} aria-hidden /> },
        { label: "Home Value Estimator", href: "/home-value-estimator", icon: <Home size={16} strokeWidth={2} aria-hidden /> },
        { label: "AI CMA Analyzer", href: "/ai-cma-analyzer", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: "AI Deal Analyzer", href: "/ai-real-estate-deal-analyzer", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: "Smart CMA Builder", href: "/smart-cma-builder", icon: <FileText size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Resources ── content surfaces ── */
    {
      label: "Resources",
      icon: <BookOpen size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: "Blog", href: "/blog", icon: <BookOpen size={16} strokeWidth={2} aria-hidden /> },
        { label: "Help center", href: "/help", icon: <LifeBuoy size={16} strokeWidth={2} aria-hidden /> },
        { label: "FAQ", href: "/help/faq", icon: <HelpCircle size={16} strokeWidth={2} aria-hidden /> },
        { label: "About", href: "/about", icon: <Users size={16} strokeWidth={2} aria-hidden /> },
        { label: "Contact", href: "/contact", icon: <Mail size={16} strokeWidth={2} aria-hidden /> },
        { label: "Support chat", href: "/support", icon: <MessageCircle size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Compare ── decision-stage surfaces ── */
    {
      label: "Compare",
      icon: <ArrowRightLeft size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: "vs. other CRMs", href: "/agent/compare", icon: <ArrowRightLeft size={16} strokeWidth={2} aria-hidden /> },
        { label: "Switch from your CRM", href: "/switch-from", icon: <Building2 size={16} strokeWidth={2} aria-hidden /> },
        { label: "Coaching", href: "/agent/coaching", icon: <GraduationCap size={16} strokeWidth={2} aria-hidden /> },
        { label: "Home Value Leads", href: "/agent-home-value-leads", icon: <TrendingUp size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Homes ── consumer search surface ── */
    {
      label: "Homes for sale",
      href: "/homes",
      match: ["/homes", "/homes/search"],
      icon: <Search size={16} strokeWidth={2} aria-hidden />,
    },

    /* ── Pricing ── leaf link, top-level for conversion visibility ── */
    {
      label: "Pricing",
      href: "/agent/pricing",
      match: ["/agent/pricing", "/pricing"],
      icon: <Calculator size={16} strokeWidth={2} aria-hidden />,
    },

    /* ── Schedule a Demo ── call-to-action for booking ── */
    {
      label: "Schedule a Demo",
      href: "/login?next=/book",
      icon: <Phone size={16} strokeWidth={2} aria-hidden />,
    },
  ],
} satisfies NavConfig;

export const leadSmartMarketingNav = marketingNavConfig.sections;

export default marketingNavConfig;

import type { NavConfig, NavSection } from "@repo/ui";
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
 * sections in the mobile drawer. Leaves render as direct links.
 *
 * i18n: labels are resolved through a `tr(key, english)` function so the
 * same structure produces the English default (`leadSmartMarketingNav`) and
 * a localized copy (`getMarketingNavSections(t)`), keeping one source of
 * truth for hrefs, icons, and keys. Copy lives under the `web_marketing`
 * bundle (`nav.*`, `link.*`, `cta.*`).
 */

/** Resolve a label: `(i18n key, English fallback) → display string`. */
type LabelResolver = (key: string, english: string) => string;

function buildSections(tr: LabelResolver): NavSection[] {
  return [
    /* ── Product ── what CloseBoss actually is ── */
    {
      label: tr("nav.product", "Product"),
      icon: <Sparkles size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: tr("link.features", "Features"), href: "/features", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.live_demo", "Live demo"), href: "/try-demo", icon: <MonitorPlay size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.voice_ai_test_drive", "Test-drive voice AI"), href: "/voice-ai-test-drive", icon: <Phone size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.integrations", "Integrations"), href: "/integrations", icon: <Plug size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Free tools ── top-of-funnel lead magnets ── */
    {
      label: tr("nav.free_tools", "Free tools"),
      icon: <Wand2 size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: tr("link.all_free_tools", "All free tools"), href: "/free-tools", icon: <Wand2 size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.mortgage_calculator", "Mortgage Calculator"), href: "/mortgage-calculator", icon: <Calculator size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.cap_rate_calculator", "Cap Rate Calculator"), href: "/cap-rate-calculator", icon: <Calculator size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.home_value_estimator", "Home Value Estimator"), href: "/home-value-estimator", icon: <Home size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.ai_cma_analyzer", "AI CMA Analyzer"), href: "/ai-cma-analyzer", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.ai_deal_analyzer", "AI Deal Analyzer"), href: "/ai-real-estate-deal-analyzer", icon: <Sparkles size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.smart_cma_builder", "Smart CMA Builder"), href: "/smart-cma-builder", icon: <FileText size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Resources ── content surfaces ── */
    {
      label: tr("nav.resources", "Resources"),
      icon: <BookOpen size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: tr("link.blog", "Blog"), href: "/blog", icon: <BookOpen size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.help_center", "Help center"), href: "/help", icon: <LifeBuoy size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.faq", "FAQ"), href: "/help/faq", icon: <HelpCircle size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.about", "About"), href: "/about", icon: <Users size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.contact", "Contact"), href: "/contact", icon: <Mail size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.support_chat", "Support chat"), href: "/support", icon: <MessageCircle size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Compare ── decision-stage surfaces ── */
    {
      label: tr("nav.compare", "Compare"),
      icon: <ArrowRightLeft size={16} strokeWidth={2} aria-hidden />,
      defaultOpen: false,
      items: [
        { label: tr("link.vs_other_crms", "vs. other CRMs"), href: "/agent/compare", icon: <ArrowRightLeft size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.switch_from_crm", "Switch from your CRM"), href: "/switch-from", icon: <Building2 size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.coaching", "Coaching"), href: "/agent/coaching", icon: <GraduationCap size={16} strokeWidth={2} aria-hidden /> },
        { label: tr("link.home_value_leads", "Home Value Leads"), href: "/agent-home-value-leads", icon: <TrendingUp size={16} strokeWidth={2} aria-hidden /> },
      ],
    },

    /* ── Homes ── consumer search surface ── */
    {
      label: tr("nav.homes", "Homes for sale"),
      href: "/homes",
      match: ["/homes", "/homes/search"],
      icon: <Search size={16} strokeWidth={2} aria-hidden />,
    },

    /* ── Pricing ── leaf link, top-level for conversion visibility ── */
    {
      label: tr("nav.pricing", "Pricing"),
      href: "/agent/pricing",
      match: ["/agent/pricing", "/pricing"],
      icon: <Calculator size={16} strokeWidth={2} aria-hidden />,
    },

    /* ── Schedule a Demo ── call-to-action for booking ── */
    {
      label: tr("cta.schedule_demo", "Schedule a Demo"),
      href: "/book",
      icon: <Phone size={16} strokeWidth={2} aria-hidden />,
    },
  ];
}

/** English default — used by non-localized consumers and as the fallback. */
export const leadSmartMarketingNav = buildSections((_key, english) => english);

/**
 * Localized nav sections. Pass a `web_marketing`-scoped `t` (from
 * `useTranslation("web_marketing")`); labels resolve to the active locale.
 */
export function getMarketingNavSections(t: (key: string) => string): NavSection[] {
  return buildSections((key) => t(key));
}

const marketingNavConfig = {
  id: "leadsmart-marketing",
  sidebarTitle: "Menu",
  sections: leadSmartMarketingNav,
} satisfies NavConfig;

export default marketingNavConfig;

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/* ── Scroll-triggered fade-in hook ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <Tag
      ref={ref as any}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Hero address search — per validation report UX-01. The homepage historically
 * led with a button-only CTA on a real-estate-domain URL, which failed the
 * intent test for "homes for sale [city]" traffic. This input routes directly
 * into /home-value pre-filled so the tool completes the intent the URL
 * promises. The empty-submit path falls back to /home-value so users who
 * don't know their ZIP still get to the tool.
 */
function HeroAddressSearch() {
  const router = useRouter();
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = addr.trim();
    setBusy(true);
    const target = trimmed
      ? `/home-value?address=${encodeURIComponent(trimmed)}`
      : `/home-value`;
    router.push(target);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col items-stretch gap-2 sm:flex-row"
      role="search"
      aria-label="Check home value by address"
    >
      <label htmlFor="hero-address" className="sr-only">
        Enter address or ZIP to check home value
      </label>
      <input
        id="hero-address"
        name="address"
        type="text"
        inputMode="text"
        autoComplete="street-address"
        placeholder="Enter an address or ZIP code"
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#0072ce] focus:outline-none focus:ring-4 focus:ring-[#0072ce]/20"
      />
      <button
        type="submit"
        disabled={busy}
        className="group relative inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-[#0072ce] to-[#4F46E5] px-7 py-4 text-base font-semibold text-white shadow-xl shadow-[#0072ce]/25 transition-all duration-300 hover:shadow-2xl hover:shadow-[#0072ce]/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0072ce]/40 active:scale-[0.97] disabled:cursor-wait disabled:opacity-80"
      >
        <span className="relative z-10">{busy ? "Loading…" : "Check value — free"}</span>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#005ca8] to-[#3730a3] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </button>
    </form>
  );
}

/* ── Animated counter ──
 * Renders the real target value on SSR and initial client paint so the stats
 * strip never flashes placeholder zeros (a trust-breaking first impression
 * for scrapers, slow connections, reduced-motion users, and no-JS visitors).
 *
 * Animation policy:
 *  - If the element is NOT yet in view on first mount, we animate from 0 →
 *    target the first time it scrolls into view.
 *  - If the element IS already in view on first mount (e.g. stats strip
 *    above the fold on a large display), we skip the animation entirely —
 *    the real value was already painted, no need to redraw from zero.
 *  - Reduced-motion users always see the static target value.
 */
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(target);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    // If the element is already in the viewport on mount, the user has
    // already seen the target value — don't flash back to 0 to animate.
    const rect = el.getBoundingClientRect();
    const alreadyVisible =
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0;
    if (alreadyVisible) {
      hasAnimated.current = true;
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) return;
        hasAnimated.current = true;
        io.disconnect();

        let frame: number;
        setCount(0);
        const duration = 1200;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(eased * target));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return <span ref={ref}>{`${count.toLocaleString()}${suffix}`}</span>;
}

/* ── Interactive FAQ Accordion ── */
function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // useId() produces SSR-safe identifiers that match between
  // server and client renders. The previous module-level counter
  // (`let faqId = 0; ++faqId`) re-counted from 1 on the client
  // while the server reached 17 by the first render, producing a
  // hydration mismatch on every page load.
  const reactId = useId();
  const id = `faq-${reactId}`;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white transition-all duration-200 hover:border-slate-300">
      <button
        type="button"
        id={`${id}-trigger`}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
      >
        <h3 className="font-semibold text-slate-900">{q}</h3>
        <svg
          className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? "200px" : "0px", opacity: open ? 1 : 0 }}
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{a}</p>
      </div>
    </div>
  );
}

/* ── Tool icons (inline SVGs) ── */
const toolIcons: Record<string, React.ReactNode> = {
  "Home Value Estimator": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  "Mortgage Calculator": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  ),
  "Affordability Calculator": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  "AI Property Comparison": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  ),
  "Refinance Analyzer": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
    </svg>
  ),
  "Rent vs Buy Calculator": (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
    </svg>
  ),
};

/**
 * Accent palettes for tool card icon chips. Each entry is a pair of
 * Tailwind class fragments: a tinted background for the chip and a
 * matching saturated text color for the icon stroke. Colors picked to
 * give each card a unique visual identity (audit item: "tool cards all
 * look identical") while staying within a complementary set that reads
 * as one coordinated palette rather than a clown-car rainbow.
 */
const ACCENTS = {
  blue:    { chip: "bg-blue-50 text-[#0072ce]",    ring: "group-hover:bg-blue-100" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", ring: "group-hover:bg-emerald-100" },
  amber:   { chip: "bg-amber-50 text-amber-600",     ring: "group-hover:bg-amber-100" },
  violet:  { chip: "bg-violet-50 text-violet-600",   ring: "group-hover:bg-violet-100" },
  teal:    { chip: "bg-teal-50 text-teal-600",       ring: "group-hover:bg-teal-100" },
  rose:    { chip: "bg-rose-50 text-rose-600",       ring: "group-hover:bg-rose-100" },
} as const;

type ToolAccent = keyof typeof ACCENTS;

type ToolCard = {
  title: string;
  description: string;
  href: string;
  badge?: string;
  /** Bento grid: "featured" spans 2 cols on md */
  featured?: boolean;
  accent: ToolAccent;
};

const tools: ToolCard[] = [
  {
    title: "Home Value Estimator",
    description: "Get an instant AI-powered estimate of your property's current market value — with confidence range and comparable sales.",
    href: "/home-value",
    badge: "Most Popular",
    featured: true,
    accent: "blue",
  },
  {
    title: "Mortgage Calculator",
    description: "See your exact monthly payment broken down by principal, interest, taxes, and insurance.",
    href: "/mortgage-calculator",
    accent: "emerald",
  },
  {
    title: "Affordability Calculator",
    description: "Find out exactly how much house you can afford based on your income, debt, and down payment.",
    href: "/affordability-calculator",
    accent: "amber",
  },
  {
    title: "AI Property Comparison",
    description: "Let AI analyze two or more properties side by side — price per sqft, investment potential, and more.",
    href: "/ai-property-comparison",
    badge: "AI",
    accent: "violet",
  },
  {
    title: "Refinance Analyzer",
    description: "See if refinancing saves you money with a real break-even analysis factoring in closing costs.",
    href: "/refinance-calculator",
    accent: "teal",
  },
  {
    title: "Rent vs Buy Calculator",
    description: "Compare total cost of renting vs buying over 5, 10, or 20 years. See which builds more wealth.",
    href: "/rent-vs-buy",
    accent: "rose",
  },
];

/**
 * Illustrated avatar renderers. Each returns a <svg> with an inline
 * flat-illustration "bust": circular skin-tone background, hair, shirt,
 * and a simple face. Clearly non-photographic — the audit flagged the
 * previous initials-in-colored-circles as reading like fake/AI-generated
 * testimonials because the format is what stock-site placeholder UI
 * libraries use when they don't have real headshots. These are openly
 * illustrated so there's no pretense of being real photos, and can be
 * swapped one-at-a-time for real customer headshots as they come in.
 *
 * Keep these as literal React nodes rather than a config lookup so each
 * avatar can be styled independently (different hair, skin, shirt).
 */
const TestimonialAvatar = {
  sandra: (
    <svg viewBox="0 0 64 64" aria-hidden className="h-full w-full">
      <circle cx="32" cy="32" r="32" fill="#fde7d2" />
      {/* hair back */}
      <path d="M12 30c0-12 9-22 20-22s20 10 20 22v10H12V30z" fill="#8b4a2b" />
      {/* face */}
      <circle cx="32" cy="34" r="13" fill="#f3c9a4" />
      {/* hair front bob */}
      <path d="M18 28c2-8 8-14 14-14s12 6 14 14c-3-2-6-3-10-3-6 0-11 1-18 3z" fill="#6b3618" />
      {/* eyes */}
      <circle cx="27" cy="34" r="1.3" fill="#2a1810" />
      <circle cx="37" cy="34" r="1.3" fill="#2a1810" />
      {/* smile */}
      <path d="M28 39c1 1.5 2.5 2.5 4 2.5s3-1 4-2.5" stroke="#8b4a2b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* shirt */}
      <path d="M12 56c0-7 8-10 20-10s20 3 20 10v8H12v-8z" fill="#dc2e4f" />
      <path d="M26 48l6 7 6-7" stroke="#fde7d2" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  david: (
    <svg viewBox="0 0 64 64" aria-hidden className="h-full w-full">
      <circle cx="32" cy="32" r="32" fill="#e3c6ab" />
      {/* face */}
      <circle cx="32" cy="32" r="13" fill="#d4a373" />
      {/* hair — short dark crop */}
      <path d="M19 25c0-7 6-13 13-13s13 6 13 13c-3-2-7-3-13-3s-10 1-13 3z" fill="#1f1410" />
      {/* eyebrows */}
      <path d="M25 29h4M35 29h4" stroke="#1f1410" strokeWidth="1.4" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="27" cy="33" r="1.3" fill="#1f1410" />
      <circle cx="37" cy="33" r="1.3" fill="#1f1410" />
      {/* smile */}
      <path d="M28 39c1.5 1.5 2.5 2 4 2s2.5-0.5 4-2" stroke="#6b3618" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* shirt — blue button-down */}
      <path d="M12 56c0-7 8-10 20-10s20 3 20 10v8H12v-8z" fill="#0072ce" />
      <path d="M32 46v18" stroke="#005ca8" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="32" cy="52" r="0.9" fill="#fff" />
      <circle cx="32" cy="58" r="0.9" fill="#fff" />
    </svg>
  ),
  tina: (
    <svg viewBox="0 0 64 64" aria-hidden className="h-full w-full">
      <circle cx="32" cy="32" r="32" fill="#f5d8b8" />
      {/* long hair */}
      <path d="M13 28c0-11 8-20 19-20s19 9 19 20v24H13V28z" fill="#2d1b0e" />
      {/* face */}
      <circle cx="32" cy="34" r="13" fill="#e0a878" />
      {/* bangs */}
      <path d="M20 28c1-6 6-10 12-10s11 4 12 10c-3-1-7-2-12-2s-9 1-12 2z" fill="#1f130a" />
      {/* eyes — with lashes */}
      <path d="M25 33l1.5 1.5M39 33l-1.5 1.5" stroke="#2d1b0e" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="27" cy="34.5" r="1.3" fill="#2d1b0e" />
      <circle cx="37" cy="34.5" r="1.3" fill="#2d1b0e" />
      {/* smile */}
      <path d="M28 40c1.5 2 2.5 2.5 4 2.5s2.5-.5 4-2.5" stroke="#8b4a2b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* blazer */}
      <path d="M12 56c0-7 8-10 20-10s20 3 20 10v8H12v-8z" fill="#10b981" />
      <path d="M22 48l10 10 10-10" stroke="#064e3b" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

const testimonials = [
  {
    quote: "The home value estimator was way more accurate than Zillow. Helped me price my listing right — sold in 4 days.",
    name: "Sandra K.",
    role: "Home Seller · Phoenix, AZ",
    avatar: TestimonialAvatar.sandra,
  },
  {
    quote: "Used the mortgage calculator before every offer. Knowing my real monthly number gave me confidence to negotiate.",
    name: "David L.",
    role: "First-Time Buyer · Atlanta, GA",
    avatar: TestimonialAvatar.david,
  },
  {
    quote: "The property comparison AI saved me weeks of spreadsheet work. I found my investment property in a weekend.",
    name: "Tina M.",
    role: "Real Estate Investor · Chicago, IL",
    avatar: TestimonialAvatar.tina,
  },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "All the core tools, no account required.",
    features: ["Home value estimates", "Mortgage & refinance calculators", "Affordability calculator", "Rent vs buy analysis", "Basic property comparison"],
    cta: "Get Started Free",
    href: "/home-value",
    highlighted: false,
  },
  {
    name: "Premium",
    price: "$19",
    period: "/month",
    description: "Deeper insights for serious buyers and investors.",
    features: ["Everything in Free", "Full home value report with confidence range", "AI property comparison (unlimited)", "Market trend overlays", "Saved searches & alerts", "Priority support"],
    cta: "Try Premium Free",
    href: "/pricing",
    highlighted: true,
  },
];

/**
 * Popular-city × tool grid for SEO internal linking. Grouped by city so
 * crawlers and visitors both see a clean "browse by location" matrix
 * instead of a flat link list. Each entry is a (city, tool) pair pointing
 * at the programmatic SEO page at /growth/seo/<tool>/<city-slug>.
 */
const EXPLORE_CITIES = [
  {
    city: "Los Angeles, CA",
    slug: "los-angeles-ca",
  },
  {
    city: "San Diego, CA",
    slug: "san-diego-ca",
  },
  {
    city: "Phoenix, AZ",
    slug: "phoenix-az",
  },
  {
    city: "Atlanta, GA",
    slug: "atlanta-ga",
  },
] as const;

const EXPLORE_TOOLS = [
  // Canonical slugs per TOM BF-022 — match the actual app directory names so
  // programmatic SEO pages land on 200s instead of hitting a redirect hop.
  { label: "Home Value", seoSlug: "home-value" },
  { label: "Mortgage", seoSlug: "mortgage-calculator" },
  { label: "Rent vs Buy", seoSlug: "rent-vs-buy" },
] as const;

export default function PropertyToolsHomePage() {
  return (
    <div id="main-content" className="bg-white text-slate-900">

      {/* ═══ HERO — animated gradient mesh background ═══ */}
      <section className="relative overflow-hidden px-4 pb-8 pt-20 text-center md:px-6 md:pb-12 md:pt-28 lg:pt-32">
        {/* Animated gradient mesh */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-white" />
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.15] blur-[100px]" style={{ background: "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)" }} />
          <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full opacity-[0.08] blur-[80px]" style={{ background: "radial-gradient(circle, #ff8c42, transparent 70%)" }} />
        </div>

        {/*
         * Hero content paints INSTANTLY (no fadeInUp animation on
         * above-the-fold elements) — the previous 5-staggered fadeInUp
         * chain pushed LCP out by ~700ms because the last element
         * wasn't visible until `0.32s delay + 0.7s duration = 1.02s`
         * after first paint. For SEO and conversion, hero must be
         * there instantly. We still keep the scroll-triggered Reveal
         * animations on below-the-fold sections.
         */}
        <div className="relative mx-auto max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#0072ce]/20 bg-white/80 px-4 py-1.5 text-xs font-medium text-[#0072ce] shadow-sm shadow-[#0072ce]/5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0072ce] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#0072ce]" /></span>
            Free AI-powered real estate tools
          </div>
          <h1 className="font-heading text-5xl font-extrabold leading-[1.02] tracking-[-0.02em] text-slate-950 sm:text-6xl lg:text-7xl xl:text-[88px]">
            Know What a Home Is Worth
            <br />
            <span className="bg-gradient-to-r from-[#0072ce] to-[#005ca8] bg-clip-text text-transparent">Before Anyone Else</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-slate-600 md:text-2xl">
            AI calculators that give you <strong className="text-slate-900">real numbers</strong> — not ballpark guesses. Trusted by buyers, sellers, and investors making smarter decisions.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <HeroAddressSearch />
            <Link
              href="#tools"
              className="group inline-flex items-center gap-1 text-sm font-medium text-slate-600 underline-offset-4 transition-colors hover:text-[#0072ce] hover:underline focus-visible:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#0072ce]/40"
            >
              or browse all free tools
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">
            <span className="text-emerald-600">✓</span> No sign-up required
            <span className="mx-2 text-slate-300">·</span>
            <span className="text-emerald-600">✓</span> Instant results
            <span className="mx-2 text-slate-300">·</span>
            <span className="text-emerald-600">✓</span> Free forever
          </p>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF STRIP — with animated counters ═══ */}
      <section className="border-y border-slate-100 bg-white px-4 py-8 md:px-6">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { value: 50000, suffix: "+", label: "Estimates generated" },
            { value: 6, suffix: "", label: "Free tools" },
            { value: 4, suffix: ".8", label: "User rating", isStatic: true },
            { value: 30, suffix: "s", label: "Average result time" },
          ].map((s) => (
            <Reveal key={s.label} className="text-center">
              <p className="text-2xl font-extrabold text-slate-900 md:text-3xl">
                {s.isStatic ? `${s.value}${s.suffix}` : <CountUp target={s.value} suffix={s.suffix} />}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ BENTO TOOL GRID ═══ */}
      <section id="tools" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">Features</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">Real Estate Tools That Actually Help</h2>
            <p className="mt-3 text-base text-slate-600">AI-powered calculators and analyzers — mortgage, affordability, rent-vs-buy, cap rate, and more. No sign-up, no paywall on the basics.</p>
          </Reveal>

          {/* Bento grid: featured card spans 2 cols */}
          <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-[auto_auto] lg:gap-5">
            {tools.map((tool, i) => (
              <Reveal key={tool.title} delay={i * 70} className={tool.featured ? "md:col-span-2 md:row-span-2" : ""}>
                <Link
                  href={tool.href}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/[0.06] ${
                    tool.featured ? "p-8 md:p-10" : "p-6"
                  }`}
                >
                  {/* Gradient accent on hover */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0072ce]/[0.02] via-transparent to-[#4F46E5]/[0.02] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  {tool.badge && (
                    <span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      tool.badge === "AI"
                        ? "bg-violet-600 text-white shadow-sm shadow-violet-600/20"
                        : "bg-amber-400 text-amber-950"
                    }`}>
                      {tool.badge}
                    </span>
                  )}

                  {/* Icon chip — color-coded per tool for at-a-glance differentiation */}
                  <div className={`flex items-center justify-center rounded-xl transition-colors ${ACCENTS[tool.accent].chip} ${ACCENTS[tool.accent].ring} ${tool.featured ? "mb-5 h-14 w-14" : "mb-4 h-12 w-12"}`}>
                    {toolIcons[tool.title]}
                  </div>

                  <h3 className={`font-heading font-bold text-slate-900 transition-colors group-hover:text-[#0072ce] ${tool.featured ? "text-xl" : "text-base"}`}>
                    {tool.title}
                  </h3>
                  <p className={`mt-2 flex-1 leading-relaxed text-slate-600 ${tool.featured ? "text-base" : "text-sm"}`}>
                    {tool.description}
                  </p>
                  <div
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0072ce] opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                    aria-hidden
                  >
                    Try free
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF — with avatars ═══ */}
      <section className="bg-slate-50 px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">Customer stories</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">Trusted by Real People</h2>
            <p className="mt-3 text-base text-slate-600">Hear from buyers, sellers, and investors who use our tools.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <div className="flex h-full flex-col rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="mb-4 flex gap-0.5 text-amber-400">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <svg key={j} className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden>
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="flex-1 text-sm leading-relaxed text-slate-700">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <footer className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200/80">
                      {t.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </footer>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">Pricing</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">Simple, Transparent Pricing</h2>
            <p className="mt-3 text-base text-slate-600">Start free. Upgrade when you need more.</p>
          </Reveal>
          <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
            {pricingPlans.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 120}>
                <div className={`relative overflow-hidden rounded-2xl border p-7 text-left transition-all duration-300 hover:shadow-lg ${
                  plan.highlighted
                    ? "border-[#0072ce]/40 bg-gradient-to-b from-white to-[#0072ce]/[0.03] shadow-lg shadow-[#0072ce]/[0.08] ring-1 ring-[#0072ce]/20"
                    : "border-slate-200 bg-white"
                }`}>
                  {plan.highlighted && (
                    <div className="absolute -right-8 top-5 rotate-45 bg-gradient-to-r from-[#0072ce] to-[#4F46E5] px-10 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">Popular</div>
                  )}
                  <h3 className="font-heading text-lg font-bold">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                    {/* TOM BF-020: explicit text-node space so "$0 forever"
                        stays legible when copy-pasted (gap-1 alone gives
                        visual spacing but zero character content). */}
                    {" "}
                    <span className="text-sm text-slate-500">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0072ce]/10">
                          <svg className="h-3 w-3 text-[#0072ce]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} aria-label={`${plan.cta} - ${plan.name} plan`} className={`mt-7 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-[#0072ce] to-[#4F46E5] text-white shadow-lg shadow-[#0072ce]/20 hover:shadow-xl hover:brightness-110"
                      : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                  }`}>
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CloseBoss cross-promo was previously a hero-sized section here.
          Demoted to footer per validation report UX-05 — consumer homepage
          shouldn't route consumers to the agent product as a primary CTA.
          See components/Footer.tsx "For Agents" column. */}

      {/* ═══ SEO EXPLORE — city × tool grid ═══ */}
      <section className="border-y border-slate-200/70 bg-slate-50/60 px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">Browse by location</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">
              Local data for every major market
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Pick your city to get home value estimates, mortgage rates, and rent-vs-buy comparisons tuned to local data.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXPLORE_CITIES.map((city, i) => (
              <Reveal key={city.slug} delay={i * 60}>
                <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span className="text-base" aria-hidden>📍</span>
                    <h3 className="font-heading text-base font-bold text-slate-900">{city.city}</h3>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1">
                    {EXPLORE_TOOLS.map((tool) => (
                      <li key={`${city.slug}-${tool.seoSlug}`}>
                        <Link
                          href={`/growth/seo/${tool.seoSlug}/${city.slug}`}
                          className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#0072ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40"
                        >
                          <span>{tool.label}</span>
                          <svg
                            className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-[#0072ce]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            aria-hidden
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-slate-500">
            Don&apos;t see your city? <Link href="/home-value" className="font-medium text-[#0072ce] underline-offset-4 hover:underline">Check your home value for any address</Link>.
          </p>
        </div>
      </section>

      {/* ═══ FAQ — Interactive Accordion ═══ */}
      <section className="px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">FAQ</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">Questions? We&apos;ve Got Answers</h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            <FaqItem q="How accurate is the home value estimate?" a="Our AI uses recent comparable sales, neighborhood trends, and property data to generate estimates. For most homes, the estimate is within 5–10% of market value. The Premium report includes a confidence range and data sources so you can see exactly how we got there." defaultOpen />
            <FaqItem q="How much house can I actually afford?" a="Our affordability calculator uses your gross income, monthly debts, down payment, and current interest rates to calculate your maximum purchase price — following standard lender guidelines (28/36 DTI rule). It only takes 30 seconds." />
            <FaqItem q="Is it better to rent or buy right now?" a="It depends on your local market, how long you plan to stay, and your financial situation. Our Rent vs Buy tool runs a 10-year comparison showing total cost, net worth impact, and the break-even point specific to your numbers." />
            <FaqItem q="Do I need to create an account?" a="No account is needed for core tools — home value estimates, mortgage calculator, affordability, and rent vs buy are all free without signing up. Create a free account to save your results, set alerts, or unlock the full Premium home value report." />
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative overflow-hidden px-4 py-24 text-center text-white md:px-6 md:py-32">
        <div className="absolute inset-0 -z-10 bg-slate-950" />
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-[100px]" style={{ background: "conic-gradient(from 0deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #7c3aed 240deg, #0072ce 360deg)" }} />
        </div>
        <Reveal>
          <h2 className="text-3xl font-extrabold md:text-4xl lg:text-5xl">Make Smarter Real Estate Decisions</h2>
          <p className="mt-4 text-lg text-slate-400">Free tools. Instant results. No account required.</p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/home-value" className="rounded-2xl bg-white px-8 py-4 text-sm font-semibold text-slate-900 shadow-xl transition-all duration-200 hover:bg-slate-100 hover:shadow-2xl active:scale-[0.97]">
              Check Your Home Value
            </Link>
            <Link href="#tools" className="rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/10 active:scale-[0.97]">
              Browse All Tools
            </Link>
          </div>
        </Reveal>
      </section>

    </div>
  );
}

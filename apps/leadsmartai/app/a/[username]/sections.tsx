import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarCheck,
  Globe,
  Handshake,
  Home,
  KeyRound,
  Languages,
  Mail,
  MapPin,
  MessageCircle,
  Percent,
  PhoneCall,
  PiggyBank,
  Quote,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";
import { avatarUrl } from "@/lib/closeboss/avatars";
import {
  actionHref,
  finalCtasToRender,
  heroCtasToRender,
  servicesToRender,
  socialLinks,
  toolKeysToRender,
  type HubCta,
  type ServiceIcon,
} from "@/lib/marketing-hub/config";
import { areaSlug } from "@/lib/marketing-hub/areas";
import { contentBody, slugFor, titleOf } from "@/lib/marketing-hub/contentPages";
import type { FeedItem } from "@/lib/marketing-hub/feedItems";
import type { Hub } from "@/lib/marketing-hub/loadHub";
import { availablePages, sectionHref, type HubPageFacts } from "@/lib/marketing-hub/pages";
import HubMobileNav from "./HubMobileNav";
import { hubTool, hubToolHref, resolveHubTools, type HubToolIcon } from "@/lib/marketing-hub/tools";
import type { HubLabels } from "./labels";
import { BTN, BTN_SM, type HubTheme } from "./theme";
import TrackedLink from "./TrackedLink";

/**
 * The public hub, section by section. All server components: they take the
 * loaded hub, the resolved labels and the theme, and render HTML. The only
 * interactive parts (chat, forms, tracked links) are separate client files.
 *
 * Every section renders nothing when it has nothing to say. A heading over
 * an empty grid is the "giant blank area" the spec forbids.
 */

export type SectionProps = {
  hub: Hub;
  L: HubLabels;
  theme: HubTheme;
  /** True on the home page, where in-page anchors can scroll; false on subpages. */
  fromHome?: boolean;
};

/**
 * An in-page anchor from a CTA (`#assistant`, `#contact`) resolved for where
 * it is rendered: on the home page it scrolls; on a subpage it navigates
 * home (or, in the pages layout, to the Contact page).
 */
function anchorHref(href: string, hub: Hub, fromHome: boolean | undefined): string {
  if (!href.startsWith("#")) return href;
  const key = href.slice(1);
  const layout = hub.config.appearance.layout;
  if (key === "contact") return sectionHref(hub.username, "contact", layout, { fromHome });
  if (key === "assistant") return sectionHref(hub.username, "assistant", layout, { fromHome });
  return fromHome ? href : `/@${hub.username}${href}`;
}

export function displayNameOf(hub: Hub): string {
  return hub.agent?.name?.trim() || hub.brandName || `@${hub.username}`;
}

function ctaContext(hub: Hub) {
  return {
    username: hub.username,
    phone: hub.config.profile.showPhone ? hub.agent?.phone ?? null : null,
    email: hub.config.profile.showEmail ? hub.agent?.email ?? null : null,
    externalBookingUrl: hub.booking.externalUrl,
  };
}

/** A configured CTA resolved to label + href, or null when its channel is missing. */
export function resolveCta(
  cta: HubCta,
  hub: Hub,
  L: HubLabels,
  fromHome?: boolean,
): { label: string; href: string; kind: string } | null {
  if (cta.action.kind === "book" && hub.booking.mode === "off") return null;
  if (cta.action.kind === "ai_chat" && !hub.assistantAvailable) return null;
  const raw = actionHref(cta.action, ctaContext(hub));
  if (!raw) return null;
  const label = cta.label?.trim() || L.cta[cta.action.kind] || L.cta.contact;
  return { label, href: anchorHref(raw, hub, fromHome), kind: cta.action.kind };
}

const CTA_ICON: Record<string, LucideIcon> = {
  home_value: Home,
  find_home: Search,
  ai_chat: MessageCircle,
  book: CalendarCheck,
  contact: Mail,
  call: PhoneCall,
  email: Mail,
  url: ArrowRight,
};

export function CtaButtons({
  ctas,
  hub,
  L,
  theme,
  fromHome,
  event,
  className,
  onBand,
}: SectionProps & { ctas: HubCta[]; event: string; className?: string; onBand?: boolean }) {
  const resolved = ctas.map((c) => resolveCta(c, hub, L, fromHome)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (!resolved.length) return null;
  return (
    <div className={className ?? "flex flex-col gap-3 sm:flex-row sm:flex-wrap"}>
      {resolved.map((c, i) => {
        const Icon = CTA_ICON[c.kind] ?? ArrowRight;
        const style = onBand
          ? i === 0
            ? theme.bandButton
            : "bg-white/10 text-white ring-1 ring-inset ring-white/30 hover:bg-white/15"
          : i === 0
            ? theme.primary
            : theme.secondary;
        return (
          <TrackedLink
            key={`${c.kind}-${i}`}
            username={hub.username}
            href={c.href}
            event={event}
            meta={{ action: c.kind, label: c.label }}
            className={`${BTN} ${style} ${theme.ring} ${c.kind === "url" || c.href.startsWith("http") ? "" : ""} w-full sm:w-auto`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {c.label}
          </TrackedLink>
        );
      })}
    </div>
  );
}

// ── shell ────────────────────────────────────────────────────────────────

export function Section({
  id,
  kicker,
  title,
  blurb,
  children,
  theme,
  tone = "white",
}: {
  id?: string;
  kicker?: string;
  title?: string;
  blurb?: string;
  children: ReactNode;
  theme: HubTheme;
  tone?: "white" | "tint";
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 ${tone === "tint" ? "bg-slate-50" : "bg-white"} py-14 sm:py-20`}
      aria-labelledby={title && id ? `${id}-title` : undefined}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {kicker || title || blurb ? (
          <div className="mb-8 max-w-2xl sm:mb-10">
            {kicker ? (
              <p className={`mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.tint}`}>
                {kicker}
              </p>
            ) : null}
            {title ? (
              <h2 id={id ? `${id}-title` : undefined} className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {title}
              </h2>
            ) : null}
            {blurb ? <p className="mt-3 text-base leading-relaxed text-slate-600">{blurb}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** The menu: pages in the pages layout, anchors in the single layout. */
export function hubMenu(hub: Hub, L: HubLabels, fromHome: boolean | undefined): { key: string; href: string; label: string }[] {
  const layout = hub.config.appearance.layout;
  const facts: HubPageFacts = {
    config: hub.config,
    hasSavedConfig: hub.hasSavedConfig,
    areaCount: (hub.config.areas.items.length ? hub.config.areas.items : hub.serviceAreas).length,
    feedCount: hub.feed.length,
    hasAbout: Boolean(
      hub.bio || hub.specialties.length || hub.workforce.length || hub.testimonials.length || hub.config.trust.points.length,
    ),
  };
  const pages = availablePages(facts);
  const items: { key: string; href: string; label: string }[] = pages.map((key) => ({
    key,
    href: sectionHref(hub.username, key, layout, { fromHome }),
    label: L.nav[key],
  }));
  if (hub.assistantAvailable) {
    items.splice(1, 0, { key: "assistant", href: sectionHref(hub.username, "assistant", layout, { fromHome }), label: L.nav.assistant });
  }
  if (layout === "pages" && !fromHome) items.unshift({ key: "home", href: `/@${hub.username}`, label: L.nav.home });
  return items;
}

export function HubHeader({ hub, L, theme, fromHome, current }: SectionProps & { current?: string }) {
  const name = displayNameOf(hub);
  const items = hubMenu(hub, L, fromHome);
  const primaryHref = hub.assistantAvailable
    ? sectionHref(hub.username, "assistant", hub.config.appearance.layout, { fromHome })
    : sectionHref(hub.username, "contact", hub.config.appearance.layout, { fromHome });
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href={`/@${hub.username}`} className="flex min-w-0 items-center gap-3">
          {hub.portraitUrl ? (
            <Image src={hub.portraitUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" unoptimized />
          ) : null}
          <span className="truncate text-base font-semibold text-slate-900">{name}</span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label={L.nav.menu}>
          {items
            .filter((i) => i.key !== "home")
            .map((i) => (
              <Link
                key={i.key}
                href={i.href}
                aria-current={current === i.key ? "page" : undefined}
                className={`text-sm font-medium hover:text-slate-900 ${current === i.key ? "text-slate-900 underline decoration-2 underline-offset-8" : "text-slate-600"}`}
              >
                {i.label}
              </Link>
            ))}
        </nav>
        <HubMobileNav items={items.map(({ href, label }) => ({ href, label }))} label={L.nav.menu} closeLabel={L.nav.close} />
        {/* Phones get the sticky bottom bar instead; two display utilities on
            one element (`hidden` + `inline-flex`) do not reliably cascade. */}
        <div className="hidden shrink-0 sm:block">
          <TrackedLink
            username={hub.username}
            href={primaryHref}
            event="hero_cta_click"
            meta={{ action: hub.assistantAvailable ? "ai_chat" : "contact", label: "header" }}
            className={`${BTN_SM} whitespace-nowrap ${theme.primary} ${theme.ring}`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {hub.assistantAvailable ? L.cta.ai_chat : L.cta.contact}
          </TrackedLink>
        </div>
      </div>
    </header>
  );
}

/** Thumb-reach actions on phones: the primary CTA and the assistant. */
export function MobileStickyBar({ hub, L, theme, fromHome }: SectionProps) {
  const primary = heroCtasToRender(hub.config).map((c) => resolveCta(c, hub, L, fromHome)).find(Boolean);
  if (!primary && !hub.assistantAvailable) return null;
  const assistantHref = sectionHref(hub.username, "assistant", hub.config.appearance.layout, { fromHome });
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <div className="flex gap-2">
        {primary ? (
          <TrackedLink
            username={hub.username}
            href={primary.href}
            event="hero_cta_click"
            meta={{ action: primary.kind, label: "sticky" }}
            className={`${BTN} flex-1 ${theme.primary} ${theme.ring}`}
          >
            {primary.label}
          </TrackedLink>
        ) : null}
        {hub.assistantAvailable && primary?.kind !== "ai_chat" ? (
          <TrackedLink
            username={hub.username}
            href={assistantHref}
            event="hero_cta_click"
            meta={{ action: "ai_chat", label: "sticky" }}
            className={`${BTN} ${primary ? "" : "flex-1"} ${theme.secondary} ${theme.ring}`}
            ariaLabel={L.sticky.chat}
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            {primary ? null : L.sticky.chat}
          </TrackedLink>
        ) : null}
      </div>
    </div>
  );
}

// ── hero ─────────────────────────────────────────────────────────────────

export function Hero({ hub, L, theme, fromHome, bio = "full" }: SectionProps & { bio?: "full" | "excerpt" | "none" }) {
  const name = displayNameOf(hub);
  const p = hub.config.profile;
  const headline = hub.config.hero.headline?.trim() || L.hero.headline(name);
  // The bio is rendered in full just below; the subheadline is its own line.
  const sub = hub.config.hero.subheadline?.trim() || L.hero.subheadline;
  const meta = [p.title, p.location].filter(Boolean).join(" · ");
  // In the pages layout the full bio lives on About; the home page shows the
  // first paragraph and a way to read the rest.
  const bioText =
    bio === "none" || !hub.bio
      ? null
      : bio === "excerpt"
        ? (hub.bio.split(/\n\s*\n/)[0] ?? hub.bio).slice(0, 320)
        : hub.bio;
  const aboutHref = sectionHref(hub.username, "about", hub.config.appearance.layout, { fromHome });
  return (
    <section id="about" className="scroll-mt-20 bg-white pb-12 pt-10 sm:pb-16 sm:pt-16">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <div className="order-2 lg:order-1">
          <p className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${theme.tint}`}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {L.hero.aiPowered}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">{name}</h1>
          {meta ? <p className={`mt-2 text-base font-medium ${theme.text}`}>{meta}</p> : null}
          {!p.title && !p.location && hub.brandName && hub.brandName !== name ? (
            <p className="mt-2 text-base text-slate-600">{hub.brandName}</p>
          ) : null}
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-700 sm:text-xl">{headline}</p>
          {sub && sub !== headline ? <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">{sub}</p> : null}
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            {hub.serviceAreas.length ? (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dt className="sr-only">{L.hero.serving}</dt>
                <dd>{hub.serviceAreas.slice(0, 4).join(" · ")}</dd>
              </div>
            ) : null}
            {p.yearsExperience ? (
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dd>{L.hero.years(p.yearsExperience)}</dd>
              </div>
            ) : null}
            {p.languages.length ? (
              <div className="flex items-center gap-1.5">
                <Languages className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dt className="sr-only">{L.hero.languages}</dt>
                <dd>{p.languages.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
          <CtaButtons ctas={heroCtasToRender(hub.config)} hub={hub} L={L} theme={theme} fromHome={fromHome} event="hero_cta_click" className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap" />
        </div>
        <div className="order-1 lg:order-2">
          {hub.portraitUrl ? (
            <div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-3xl shadow-[var(--shadow-floating)] ring-1 ring-slate-200 sm:w-56 lg:w-full">
              <Image src={hub.portraitUrl} alt={name} fill sizes="(min-width: 1024px) 20rem, 14rem" className="object-cover" priority unoptimized />
            </div>
          ) : (
            <div className={`mx-auto flex aspect-square w-40 items-center justify-center rounded-3xl text-4xl font-semibold sm:w-56 lg:w-full ${theme.tint}`} aria-hidden>
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </div>
      {bioText ? (
        <div className="mx-auto mt-10 w-full max-w-6xl px-5 sm:px-8">
          <p className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-slate-700">{bioText}</p>
          {bio === "excerpt" ? (
            <Link href={aboutHref} className={`mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${theme.text} hover:underline`}>
              {L.seeAll.about}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          {bio !== "excerpt" && hub.specialties.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {hub.specialties.map((s) => (
                <li key={s} className="rounded-full bg-slate-50 px-3 py-1 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ── workforce ────────────────────────────────────────────────────────────

const ROLE_ICON: Record<string, LucideIcon> = {
  receptionist: PhoneCall,
  sales_assistant: Handshake,
  marketing_assistant: TrendingUp,
  transaction_assistant: Briefcase,
  accountant: BarChart3,
};

export function Workforce({ hub, L, theme }: SectionProps) {
  if (!hub.workforce.length) return null;
  const name = displayNameOf(hub);
  return (
    <Section id="team" kicker={L.workforce.kicker} title={L.workforce.title} blurb={L.workforce.blurb(name)} theme={theme} tone="tint">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hub.workforce.map((m) => {
          const role = L.workforce.roles[m.type];
          const Icon = ROLE_ICON[m.type] ?? Bot;
          return (
            <li key={m.type} className="flex gap-4 rounded-2xl bg-white p-5 shadow-[var(--shadow-raised)] ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.avatarUrl || avatarUrl(m.avatarId || m.type)}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-full bg-slate-100 object-cover"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  {m.name || role.title}
                  <Icon className={`h-4 w-4 ${theme.text}`} aria-hidden />
                </p>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{role.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.description?.trim() || role.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-6 text-sm font-semibold ${theme.text}`}>{L.workforce.tagline}</p>
      {hub.config.workforce.showHowItWorks ? <HowItWorks hub={hub} L={L} theme={theme} /> : null}
    </Section>
  );
}

/** An illustrated example of the pipeline. Labelled as such: no real data. */
function HowItWorks({ L, theme }: SectionProps) {
  const steps: { key: keyof HubLabels["workforce"]["steps"]; Icon: LucideIcon }[] = [
    { key: "missed_call", Icon: PhoneCall },
    { key: "receptionist", Icon: Bot },
    { key: "lead", Icon: Star },
    { key: "qualify", Icon: MessageCircle },
    { key: "followup", Icon: RefreshCw },
    { key: "appointment", Icon: CalendarCheck },
    { key: "crm", Icon: Briefcase },
  ];
  return (
    <div className="mt-10 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{L.workforce.howTitle}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {L.common.exampleTag}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{L.workforce.howBlurb}</p>
      <ol className="mt-5 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {steps.map(({ key, Icon }, i) => (
          <li key={key} className="relative flex w-36 shrink-0 flex-col items-center gap-2 text-center lg:w-auto">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full ${theme.tint}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-xs font-medium leading-snug text-slate-700">{L.workforce.steps[key]}</span>
            {i < steps.length - 1 ? (
              <ArrowRight className="absolute -right-3 top-3.5 h-4 w-4 text-slate-300 lg:right-[-0.85rem]" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-500">{L.workforce.howNote}</p>
    </div>
  );
}

// ── services ─────────────────────────────────────────────────────────────

const SERVICE_ICON: Record<ServiceIcon, LucideIcon> = {
  home: Home,
  key: KeyRound,
  "trending-up": TrendingUp,
  "map-pin": MapPin,
  building: Building2,
  "bar-chart": BarChart3,
  calculator: Calculator,
  search: Search,
  handshake: Handshake,
  briefcase: Briefcase,
  star: Star,
  globe: Globe,
};

/** "All services →" under a teaser, when the section was cut short. */
function SeeAll({ href, label, theme }: { href: string; label: string; theme: HubTheme }) {
  return (
    <Link href={href} className={`mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${theme.text} hover:underline`}>
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function Services({ hub, L, theme, fromHome, limit }: SectionProps & { limit?: number }) {
  if (!hub.config.services.enabled) return null;
  const all = servicesToRender(hub.config, hub.hasSavedConfig);
  if (!all.length) return null;
  const items = limit ? all.slice(0, limit) : all;
  const cut = items.length < all.length;
  return (
    <Section id="services" kicker={L.services.kicker} title={hub.config.services.headline?.trim() || L.services.title} theme={theme}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => {
          const preset = L.services.presets[s.preset];
          const name = s.name?.trim() || preset.name;
          const desc = s.description?.trim() || preset.desc;
          const Icon = SERVICE_ICON[s.icon] ?? Home;
          const cta = resolveCta(s.cta, hub, L, fromHome);
          return (
            <li key={s.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:shadow-[var(--shadow-raised)]">
              <span className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${theme.tint}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
              {desc ? <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{desc}</p> : <span className="flex-1" />}
              {cta ? (
                <TrackedLink
                  username={hub.username}
                  href={cta.href}
                  event="service_click"
                  meta={{ service: s.id, action: cta.kind }}
                  className={`mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${theme.text} hover:underline`}
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </TrackedLink>
              ) : null}
            </li>
          );
        })}
      </ul>
      {cut ? <SeeAll href={sectionHref(hub.username, "services", hub.config.appearance.layout, { fromHome })} label={L.seeAll.services} theme={theme} /> : null}
    </Section>
  );
}

// ── tools ────────────────────────────────────────────────────────────────

const TOOL_ICON: Record<HubToolIcon, LucideIcon> = {
  home: Home,
  calculator: Calculator,
  wallet: Wallet,
  receipt: Receipt,
  scale: Scale,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  percent: Percent,
  "bar-chart": BarChart3,
  search: Search,
  refresh: RefreshCw,
};

export function Tools({ hub, L, theme, fromHome, limit }: SectionProps & { limit?: number }) {
  if (!hub.config.tools.enabled) return null;
  const all = resolveHubTools(toolKeysToRender(hub.config, hub.hasSavedConfig));
  if (!all.length) return null;
  const tools = limit ? all.slice(0, limit) : all;
  const cut = tools.length < all.length;
  return (
    <Section id="tools" kicker={L.tools.kicker} title={L.tools.title} blurb={L.tools.blurb} theme={theme} tone="tint">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => {
          const copy = L.tools.items[t.key];
          const Icon = TOOL_ICON[t.icon] ?? Calculator;
          return (
            <li key={t.key}>
              <TrackedLink
                username={hub.username}
                href={hubToolHref(t, hub.username)}
                event="tool_opened"
                meta={{ tool: t.key }}
                className={`group flex h-full items-start gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-slate-300 hover:shadow-[var(--shadow-raised)] focus:outline-none focus-visible:ring-2 ${theme.ring}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.tint}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    {copy?.name ?? t.key}
                    {t.capturesLead ? null : (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {L.tools.free}
                      </span>
                    )}
                  </span>
                  {copy?.desc ? <span className="mt-0.5 block text-sm text-slate-600">{copy.desc}</span> : null}
                </span>
                <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" aria-hidden />
              </TrackedLink>
            </li>
          );
        })}
      </ul>
      {cut ? <SeeAll href={sectionHref(hub.username, "tools", hub.config.appearance.layout, { fromHome })} label={L.seeAll.tools} theme={theme} /> : null}
    </Section>
  );
}

// ── home value band ──────────────────────────────────────────────────────

export function HomeValueBand({ hub, L, theme }: SectionProps) {
  if (!hub.config.homeValue.enabled) return null;
  const hv = hub.config.homeValue;
  return (
    <section className="bg-white py-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className={`flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 ${theme.band}`}>
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{L.homeValue.kicker}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{hv.headline?.trim() || L.homeValue.title}</h2>
            <p className="mt-2 text-sm leading-relaxed opacity-90 sm:text-base">{hv.body?.trim() || L.homeValue.body}</p>
          </div>
          <TrackedLink
            username={hub.username}
            href={`/@${hub.username}/home-value`}
            event="home_value_started"
            meta={{ label: "band" }}
            className={`${BTN} shrink-0 ${theme.bandButton} ${theme.ring}`}
          >
            <Home className="h-4 w-4" aria-hidden />
            {L.homeValue.cta}
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}

// ── areas ────────────────────────────────────────────────────────────────

export function Areas({ hub, L, theme, fromHome, limit }: SectionProps & { limit?: number }) {
  if (!hub.config.areas.enabled) return null;
  const all = hub.config.areas.items.length
    ? hub.config.areas.items
    : hub.serviceAreas.map((name) => ({ name, note: null }));
  if (!all.length) return null;
  const items = limit ? all.slice(0, limit) : all;
  const cut = items.length < all.length;
  const title = hub.config.areas.headline?.trim() || L.areas.title(hub.config.profile.location || hub.serviceAreas[0] || "");
  return (
    <Section id="areas" kicker={L.areas.kicker} title={title} blurb={L.areas.blurb} theme={theme}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((a) => (
          <li key={a.name}>
            {/* Each area is its own page — the local-SEO landing for that name. */}
            <TrackedLink
              username={hub.username}
              href={`/@${hub.username}/area/${areaSlug(a.name)}`}
              event="content_opened"
              meta={{ slug: `area:${areaSlug(a.name)}` }}
              className={`group flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-[var(--shadow-raised)] focus:outline-none focus-visible:ring-2 ${theme.ring}`}
            >
              <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${theme.text}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{a.name}</span>
                {a.note ? <span className="mt-0.5 block text-sm text-slate-600">{a.note}</span> : null}
                <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold ${theme.text}`}>
                  {L.area.viewArea}
                  <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </span>
            </TrackedLink>
          </li>
        ))}
      </ul>
      {cut ? <SeeAll href={sectionHref(hub.username, "areas", hub.config.appearance.layout, { fromHome })} label={L.seeAll.areas} theme={theme} /> : null}
      {hub.assistantAvailable ? (
        <TrackedLink
          username={hub.username}
          href={sectionHref(hub.username, "assistant", hub.config.appearance.layout, { fromHome })}
          event="hero_cta_click"
          meta={{ action: "ai_chat", label: "areas" }}
          className={`mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${theme.text} hover:underline`}
        >
          {L.areas.ask}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </TrackedLink>
      ) : null}
    </Section>
  );
}

// ── featured ─────────────────────────────────────────────────────────────

export function Featured({ hub, L, theme }: SectionProps) {
  const feedBySlug = new Map<string, FeedItem>(hub.feed.map((i) => [slugFor(i), i]));
  const cards = hub.config.content.featured
    .map((f) => {
      if (f.kind === "post") {
        const item = feedBySlug.get(f.ref);
        if (!item) return null;
        return {
          id: f.id,
          badge: f.badge?.trim() || L.featured.post,
          title: f.title?.trim() || titleOf(item),
          description: f.description?.trim() || contentBody(item).slice(0, 160),
          href: `/@${hub.username}/p/${f.ref}`,
          image: item.imageUrl && item.mediaKind !== "video" ? item.imageUrl : null,
          event: "content_opened",
          meta: { slug: f.ref },
        };
      }
      if (f.kind === "tool") {
        const tool = hubTool(f.ref);
        if (!tool) return null;
        const copy = L.tools.items[tool.key];
        return {
          id: f.id,
          badge: f.badge?.trim() || L.featured.tool,
          title: f.title?.trim() || copy?.name || tool.key,
          description: f.description?.trim() || copy?.desc || "",
          href: hubToolHref(tool, hub.username),
          image: null,
          event: "tool_opened",
          meta: { tool: tool.key },
        };
      }
      if (!/^https?:\/\//i.test(f.ref)) return null;
      return {
        id: f.id,
        badge: f.badge?.trim() || L.featured.link,
        title: f.title?.trim() || f.ref,
        description: f.description?.trim() || "",
        href: f.ref,
        image: null,
        event: "content_opened",
        meta: { slug: f.ref.slice(0, 120) },
      };
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (!cards.length) return null;
  return (
    <Section id="featured" kicker={L.featured.kicker} title={L.featured.title} theme={theme} tone="tint">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition hover:shadow-[var(--shadow-raised)]">
            <TrackedLink username={hub.username} href={c.href} event={c.event} meta={c.meta} className="flex h-full flex-col">
              {c.image ? (
                <Image src={c.image} alt="" width={640} height={360} className="aspect-[16/9] w-full object-cover" unoptimized />
              ) : null}
              <span className="flex flex-1 flex-col p-5">
                <span className={`mb-2 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${theme.tint}`}>{c.badge}</span>
                <span className="text-lg font-semibold leading-snug text-slate-900">{c.title}</span>
                {c.description ? <span className="mt-1.5 line-clamp-3 text-sm text-slate-600">{c.description}</span> : null}
                <span className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${theme.text}`}>
                  {L.featured.open}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </span>
            </TrackedLink>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── trust ────────────────────────────────────────────────────────────────

export function Trust({ hub, L, theme }: SectionProps) {
  if (!hub.config.trust.enabled) return null;
  const p = hub.config.profile;
  const facts: { Icon: LucideIcon; label: string; value: string }[] = [];
  if (p.yearsExperience) facts.push({ Icon: ShieldCheck, label: L.trust.years, value: L.trust.yearsValue(p.yearsExperience) });
  if (hub.serviceAreas.length) facts.push({ Icon: MapPin, label: L.trust.areas, value: hub.serviceAreas.slice(0, 6).join(", ") });
  if (hub.specialties.length) facts.push({ Icon: Star, label: L.trust.specialties, value: hub.specialties.slice(0, 6).join(", ") });
  if (p.languages.length) facts.push({ Icon: Languages, label: L.trust.languages, value: p.languages.join(", ") });
  if (p.credentials.length) facts.push({ Icon: ShieldCheck, label: L.trust.credentials, value: p.credentials.join(", ") });
  if (hub.agent?.brokerage) facts.push({ Icon: Building2, label: L.trust.brokerage, value: hub.agent.brokerage });
  if (hub.workforce.length) facts.push({ Icon: Sparkles, label: L.trust.tech, value: L.trust.techBody });
  const points = hub.config.trust.points;
  const testimonials = hub.config.trust.showTestimonials ? hub.testimonials : [];
  if (!facts.length && !points.length && !testimonials.length) return null;
  return (
    <Section id="trust" kicker={L.trust.kicker} title={hub.config.trust.headline?.trim() || L.trust.title} theme={theme}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {facts.length ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                  <f.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${theme.text}`} aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-800">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          ) : null}
          {points.length ? (
            <ul className="mt-5 space-y-2">
              {points.map((pt) => (
                <li key={pt} className="flex gap-2 text-sm text-slate-700">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${theme.primary.split(" ")[0]}`} aria-hidden />
                  {pt}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {testimonials.length ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{L.trust.testimonials}</h3>
            <ul className="space-y-3">
              {testimonials.map((t) => (
                <li key={t.id} className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                  <Quote className={`h-5 w-5 ${theme.text}`} aria-hidden />
                  {t.rating ? (
                    <p className="mt-2 flex gap-0.5" aria-label={`${t.rating}/5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < (t.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />
                      ))}
                    </p>
                  ) : null}
                  <blockquote className="mt-2 text-sm leading-relaxed text-slate-800">{t.body}</blockquote>
                  {t.authorName ? (
                    <p className="mt-3 text-xs font-medium text-slate-600">
                      {t.authorName}
                      {t.authorTitle ? <span className="text-slate-400"> · {t.authorTitle}</span> : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

// ── final CTA ────────────────────────────────────────────────────────────

export function FinalCta({ hub, L, theme }: SectionProps) {
  if (!hub.config.finalCta.enabled) return null;
  const name = displayNameOf(hub);
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className={`rounded-3xl px-6 py-10 text-center sm:px-10 sm:py-14 ${theme.band}`}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{hub.config.finalCta.headline?.trim() || L.finalCta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-base opacity-90">{hub.config.finalCta.body?.trim() || L.finalCta.body(name)}</p>
          <CtaButtons ctas={finalCtasToRender(hub.config)} hub={hub} L={L} theme={theme} event="hero_cta_click" onBand className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap" />
        </div>
      </div>
    </section>
  );
}

// ── footer ───────────────────────────────────────────────────────────────

const SOCIAL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
  linkedin: "LinkedIn",
  x: "X",
};

export function SocialLinks({ hub, theme, L }: SectionProps) {
  const links = socialLinks(hub.config);
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={L.footer.social}>
      {links.map((l) => (
        <li key={l.network}>
          <TrackedLink
            username={hub.username}
            href={l.url}
            event="social_click"
            meta={{ network: l.network }}
            external
            className={`inline-flex min-h-10 items-center rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}
          >
            {SOCIAL_LABEL[l.network] ?? l.network}
          </TrackedLink>
        </li>
      ))}
    </ul>
  );
}

export function HubFooter({ hub, L, theme }: SectionProps) {
  const name = displayNameOf(hub);
  const p = hub.config.profile;
  const phone = p.showPhone ? hub.agent?.phone : null;
  const email = p.showEmail ? hub.agent?.email : null;
  return (
    <footer className="border-t border-slate-200 bg-slate-50 pb-24 pt-10 sm:pb-12">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-base font-semibold text-slate-900">{name}</p>
            {hub.agent?.brokerage ? <p className="text-sm text-slate-600">{hub.agent.brokerage}</p> : null}
            {hub.agent?.licenseNumber ? (
              <p className="text-sm text-slate-600">
                {L.footer.license} {hub.agent.licenseNumber}
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-1 text-sm">
              {phone ? (
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <PhoneCall className="h-4 w-4" aria-hidden /> {phone}
                </a>
              ) : null}
              {email ? (
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Mail className="h-4 w-4" aria-hidden /> {email}
                </a>
              ) : null}
              {p.website ? (
                <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Globe className="h-4 w-4" aria-hidden /> {p.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
          </div>
          <div className="sm:justify-self-end">
            <SocialLinks hub={hub} L={L} theme={theme} />
          </div>
        </div>
        {hub.config.footer.disclosure ? (
          <p className="mt-6 max-w-3xl whitespace-pre-line text-xs leading-relaxed text-slate-500">{hub.config.footer.disclosure}</p>
        ) : null}
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-slate-500">{L.footer.fairHousing}</p>
        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacy" className="hover:text-slate-800">
              {L.footer.privacy}
            </Link>
            <Link href="/terms" className="hover:text-slate-800">
              {L.footer.terms}
            </Link>
          </div>
          <a href="https://www.closebossai.com" className="inline-flex items-center gap-2 hover:text-slate-800" rel="noopener">
            <span>{L.footer.poweredBy}</span>
            <CloseBossLogo compact />
          </a>
        </div>
      </div>
    </footer>
  );
}

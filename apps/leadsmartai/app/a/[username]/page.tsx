import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { displayUsername } from "@/lib/identity/username";
import { actionHref, socialLinks } from "@/lib/marketing-hub/config";
import { loadHubByUsername, type Hub } from "@/lib/marketing-hub/loadHub";
import { hubDescription, hubTitle, realEstateAgentJsonLd } from "@/lib/marketing-hub/seo";
import { hasPrivacySignal } from "@/lib/marketing-hub/tracking";
import HubChat from "./HubChat";
import HubFeed from "./HubFeed";
import HubLeadForm from "./HubLeadForm";
import { HubTags } from "./HubTags";
import HubTracker from "./HubTracker";
import { hubLabels } from "./labels";
import {
  Areas,
  displayNameOf,
  Featured,
  FinalCta,
  Hero,
  HomeValueBand,
  HubFooter,
  HubHeader,
  MobileStickyBar,
  Section,
  Services,
  Tools,
  Trust,
  Workforce,
} from "./sections";
import { hubTheme } from "./theme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The agent's public marketing hub — PUBLIC, unauthenticated.
 *
 * Reached as closebossai.com/@michaelye (a rewrite in next.config points the
 * pretty URL here; the App Router reserves a leading "@" for parallel-route
 * slots, so this cannot live at app/@[username]).
 *
 * It is a conversion page, not a brochure: who this is, how they can help,
 * the AI assistant that answers now, the tools that capture a lead, and the
 * ways to reach a human. Each section reads the agent's configuration and
 * renders nothing when it has nothing real to say.
 *
 * Three states:
 *   ready        published, renders in full
 *   coming_soon  the handle is claimed but the hub is not published
 *   not_found    no such handle, or the agent is deleted
 *
 * Even a ready hub is noindex until it clears a content bar (see isIndexable),
 * or when the agent asked for noindex.
 */

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
}

function canonicalFor(username: string): string {
  return `${siteBase()}/@${username}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username } = await params;
  const hub = await loadHubByUsername(username);

  if (hub.status === "not_found") {
    return { title: t("hub.notFoundTitle", { ns: "web_marketing" }), robots: { index: false, follow: false } };
  }

  const name = displayNameOf(hub) || displayUsername(hub.username);

  if (hub.status === "coming_soon") {
    return {
      title: `${name} — ${t("hub.comingSoonTitle", { ns: "web_marketing" })}`,
      robots: { index: false, follow: false },
    };
  }

  const title = hubTitle({
    seoTitle: hub.config.seo.title,
    name,
    brandName: hub.brandName,
    location: hub.config.profile.location,
  });
  const description = hubDescription({
    seoDescription: hub.config.seo.description,
    bio: hub.bio,
    name,
    brandName: hub.brandName,
    location: hub.config.profile.location,
  });
  const image = hub.config.seo.ogImageUrl ?? hub.portraitUrl;

  return {
    title,
    description,
    keywords: hub.config.seo.keywords.length ? hub.config.seo.keywords : undefined,
    // A parent generateMetadata MERGES rather than resets, so the canonical is
    // set explicitly here — inheriting it once made every guide page claim to
    // be the homepage.
    alternates: { canonical: canonicalFor(hub.username) },
    robots: hub.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonicalFor(hub.username),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

async function isOwner(agentId: number | null): Promise<boolean> {
  if (agentId === null) return false;
  try {
    const ctx = await getCurrentAgentContext();
    return String(ctx.agentId) === String(agentId);
  } catch {
    return false;
  }
}

function Plain({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-3xl px-5 py-16">{children}</div>
    </main>
  );
}

export default async function AgentHubPage({ params, searchParams }: Props) {
  const t = await getServerT();
  const locale = await getServerLocale();
  const L = hubLabels(t);
  const { username } = await params;
  const query = await searchParams;
  // Read Sec-GPC before loading: the pixel decision has to be made before a
  // script tag exists in the tree, not after it has already loaded.
  const privacySignal = hasPrivacySignal(await headers());
  let hub: Hub = await loadHubByUsername(username, privacySignal);

  // The owner may look at their draft before anyone else can. Nobody else
  // gets past "coming soon": the check is the signed-in agent's own id
  // against the handle's, and a failed or absent session is simply "no".
  let preview = false;
  if (hub.status === "coming_soon" && (await isOwner(hub.agentId))) {
    hub = await loadHubByUsername(username, privacySignal, { allowUnpublished: true });
    preview = hub.status === "ready";
  }

  if (hub.status === "not_found") {
    return (
      <Plain>
        <h1 className="text-2xl font-semibold">{L.common.notFoundTitle}</h1>
        <p className="mt-3 text-slate-600">{L.common.notFoundBody}</p>
      </Plain>
    );
  }

  if (hub.status === "coming_soon") {
    return (
      <Plain>
        <p className="text-sm uppercase tracking-widest text-slate-500">{displayUsername(hub.username)}</p>
        <h1 className="mt-3 text-3xl font-semibold">{L.common.comingSoonTitle}</h1>
        <p className="mt-3 text-slate-600">{L.common.comingSoonBody}</p>
      </Plain>
    );
  }

  const theme = hubTheme(hub.config.appearance.accent);
  const name = displayNameOf(hub);
  const utm = {
    source: typeof query.utm_source === "string" ? query.utm_source : null,
    campaign: typeof query.utm_campaign === "string" ? query.utm_campaign : null,
  };
  const cfg = hub.config;
  const phone = cfg.profile.showPhone ? hub.agent?.phone ?? null : null;
  const email = cfg.profile.showEmail ? hub.agent?.email ?? null : null;
  const bookingHref =
    hub.booking.mode === "off"
      ? null
      : actionHref(
          { kind: "book", url: null },
          { username: hub.username, phone, email, externalBookingUrl: hub.booking.externalUrl },
        );

  const prompts = cfg.assistant.suggestedPrompts.length
    ? cfg.assistant.suggestedPrompts
    : [
        L.assistant.prompts.find_homes,
        L.assistant.prompts.home_worth,
        L.assistant.prompts.afford,
        L.assistant.prompts.market,
        L.assistant.prompts.sell,
        L.assistant.prompts.invest,
        L.assistant.prompts.schedule,
      ];

  const jsonLd = realEstateAgentJsonLd({
    name,
    url: canonicalFor(hub.username),
    description: hub.bio,
    imageUrl: hub.portraitUrl,
    phone,
    email,
    brokerage: hub.agent?.brokerage ?? null,
    jobTitle: cfg.profile.title,
    areas: hub.serviceAreas,
    sameAs: socialLinks(cfg).map((s) => s.url),
    languages: cfg.profile.languages,
  });

  const props = { hub, L, theme };

  return (
    <>
      {/* Records the view and issues the visitor cookies. Renders nothing. */}
      <HubTracker username={hub.username} utmSource={utm.source} utmCampaign={utm.campaign} />
      {/* The agent's own GA4 / Meta Pixel — already gated by plan and privacy signal. */}
      <HubTags decision={hub.tracking} />
      {preview ? null : (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}

      {preview ? (
        <div className="bg-amber-50 px-5 py-2 text-center text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {L.common.previewBanner}{" "}
          <Link href="/dashboard/hub?section=settings" className="font-semibold underline underline-offset-2">
            {L.common.previewPublish}
          </Link>
        </div>
      ) : null}

      <HubHeader {...props} />

      <main id="main-content">
        <Hero {...props} />

        {hub.assistantAvailable ? (
          <Section id="assistant" kicker={L.assistant.kicker} title={L.assistant.title} blurb={L.assistant.blurb} theme={theme} tone="tint">
            <div className="mx-auto max-w-3xl">
              <HubChat
                username={hub.username}
                agentName={name}
                prompts={prompts}
                theme={theme}
                locale={locale}
                utmSource={utm.source}
                utmCampaign={utm.campaign}
                labels={{
                  greeting: cfg.assistant.greeting?.trim() || L.assistant.greeting(name),
                  placeholder: L.assistant.placeholder,
                  send: L.assistant.send,
                  thinking: L.assistant.thinking,
                  disclaimer: L.assistant.disclaimer,
                  error: L.assistant.error,
                  retry: L.assistant.retry,
                  limit: L.assistant.limit,
                  leadCaptured: L.assistant.leadCaptured,
                  suggested: L.assistant.suggested,
                  newChat: L.assistant.newChat,
                  you: L.assistant.you,
                  assistantName: L.assistant.assistantName(name),
                }}
              />
            </div>
          </Section>
        ) : null}

        <Workforce {...props} />
        <Services {...props} />
        <Tools {...props} />
        <HomeValueBand {...props} />
        <Areas {...props} />
        <Featured {...props} />

        {cfg.content.showFeed && hub.feed.length ? (
          <Section id="posts" title={L.feed.title} theme={theme}>
            <HubFeed items={hub.feed} username={hub.username} labels={L.feed} />
          </Section>
        ) : null}

        <Trust {...props} />

        {cfg.leadCapture.showForm ? (
          <Section id="contact" kicker={L.nav.contact} title={L.contact.title} blurb={L.contact.blurb} theme={theme} tone="tint">
            <HubLeadForm
              username={hub.username}
              utmSource={utm.source}
              utmCampaign={utm.campaign}
              theme={theme}
              phone={phone}
              email={email}
              bookingHref={bookingHref}
              locale={locale}
              labels={L.contact}
            />
          </Section>
        ) : null}

        <FinalCta {...props} />
      </main>

      <HubFooter {...props} />
      <MobileStickyBar {...props} />
    </>
  );
}

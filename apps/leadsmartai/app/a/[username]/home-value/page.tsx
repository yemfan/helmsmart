import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { loadHubByUsername } from "@/lib/marketing-hub/loadHub";
import { hasPrivacySignal } from "@/lib/marketing-hub/tracking";
import { HubTags } from "../HubTags";
import HubTracker from "../HubTracker";
import { HubTurnstileProvider } from "../HubTurnstile";
import { turnstileSiteKey } from "../hubPage";
import { hubLabels } from "../labels";
import { displayNameOf, HubFooter, HubHeader } from "../sections";
import { hubTheme } from "../theme";
import HubHomeValueClient from "./HubHomeValueClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /@handle/home-value — the seller funnel, inside the agent's own page.
 *
 * Exists because the platform's `/home-value` page cannot attribute a lead
 * to an agent: the hub used to link there and lose the visitor. Here the
 * estimate engine is shared and the lead is the agent's.
 */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username } = await params;
  const hub = await loadHubByUsername(username);
  if (hub.status !== "ready") {
    return { title: t("hub.notFoundTitle", { ns: "web_marketing" }), robots: { index: false, follow: false } };
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
  return {
    title: { absolute: `${t("hub.homeValue.title", { ns: "web_marketing" })} — ${displayNameOf(hub)}` },
    description: t("hub.homeValue.body", { ns: "web_marketing" }),
    alternates: { canonical: `${base}/@${hub.username}/home-value` },
    robots: hub.indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function HubHomeValuePage({ params }: Props) {
  const t = await getServerT();
  const locale = await getServerLocale();
  const L = hubLabels(t);
  const { username } = await params;
  const hub = await loadHubByUsername(username, hasPrivacySignal(await headers()));

  if (hub.status !== "ready") notFound();

  const theme = hubTheme(hub.config.appearance.accent);
  const name = displayNameOf(hub);
  const props = { hub, L, theme };

  return (
    <>
      <HubTracker username={hub.username} utmSource={null} utmCampaign={null} />
      <HubTags decision={hub.tracking} />
      <HubHeader {...props} />
      <HubTurnstileProvider siteKey={turnstileSiteKey()}>
      <main id="main-content" className="bg-slate-50 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-4xl px-5 sm:px-8">
          <Link href={`/@${hub.username}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {L.homeValue.back}
          </Link>
          <p className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.tint}`}>{L.homeValue.kicker}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {hub.config.homeValue.headline?.trim() || L.homeValue.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">{hub.config.homeValue.body?.trim() || L.homeValue.body}</p>
          <div className="mt-8">
            <HubHomeValueClient
              username={hub.username}
              theme={theme}
              locale={locale}
              labels={{
                address: L.homeValue.address,
                addressPlaceholder: L.homeValue.addressPlaceholder,
                estimate: L.homeValue.estimate,
                estimating: L.homeValue.estimating,
                estimateFailed: L.homeValue.estimateFailed,
                estimateTitle: L.homeValue.estimateTitle,
                rangeLabel: L.homeValue.rangeLabel,
                unlockTitle: L.homeValue.unlockTitle,
                unlockBody: L.homeValue.unlockBody(name),
                unlockCta: L.homeValue.unlockCta,
                doneTitle: L.homeValue.doneTitle,
                doneBody: L.homeValue.doneBody(name),
                disclaimer: L.homeValue.disclaimer,
                name: L.contact.name,
                email: L.contact.email,
                phone: L.contact.phone,
                consent: L.contact.consent,
                submitting: L.contact.submitting,
                errorName: L.contact.errorName,
                errorContact: L.contact.errorContact,
                errorGeneric: L.contact.errorGeneric,
                steps: L.homeValue.steps,
              }}
            />
          </div>
        </div>
      </main>
      </HubTurnstileProvider>
      <HubFooter {...props} />
    </>
  );
}

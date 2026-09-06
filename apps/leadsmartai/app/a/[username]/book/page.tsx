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
import HubBookingClient from "./HubBookingClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/book — a consultation with the agent, in whatever shape their account supports. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username } = await params;
  const hub = await loadHubByUsername(username);
  if (hub.status !== "ready" || hub.booking.mode === "off") {
    return { title: t("hub.notFoundTitle", { ns: "web_marketing" }), robots: { index: false, follow: false } };
  }
  return {
    title: { absolute: t("hub.book.title", { ns: "web_marketing", name: displayNameOf(hub) }) },
    robots: { index: false, follow: true },
  };
}

export default async function HubBookPage({ params }: Props) {
  const t = await getServerT();
  const locale = await getServerLocale();
  const L = hubLabels(t);
  const { username } = await params;
  const hub = await loadHubByUsername(username, hasPrivacySignal(await headers()));

  if (hub.status !== "ready" || hub.booking.mode === "off") notFound();

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
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
          <Link href={`/@${hub.username}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {L.book.back}
          </Link>
          <p className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.tint}`}>{L.book.kicker}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{L.book.title(name)}</h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">{L.book.blurb}</p>
          <div className="mt-8">
            <HubBookingClient
              username={hub.username}
              mode={hub.booking.mode}
              externalUrl={hub.booking.externalUrl}
              theme={theme}
              locale={locale}
              labels={{
                pickDate: L.book.pickDate,
                pickTime: L.book.pickTime,
                closed: L.book.closed,
                noSlots: L.book.noSlots,
                loadingSlots: L.book.loadingSlots,
                yourDetails: L.book.yourDetails,
                meetingMode: L.book.meetingMode,
                modes: L.book.modes,
                notes: L.book.notes,
                confirm: L.book.confirm,
                confirming: L.book.confirming,
                doneTitle: L.book.doneTitle,
                doneBody: L.book.doneBody(name),
                requestTitle: L.book.requestTitle,
                requestBody: L.book.requestBody(name),
                externalTitle: L.book.externalTitle,
                externalBody: L.book.externalBody,
                externalCta: L.book.externalCta,
                failed: L.book.failed,
                slotTaken: L.book.slotTaken,
                duration: L.book.duration(30),
                name: L.contact.name,
                email: L.contact.email,
                phone: L.contact.phone,
                consent: L.contact.consent,
                errorName: L.contact.errorName,
                errorContact: L.contact.errorContact,
                submit: L.contact.submit,
                submitting: L.contact.submitting,
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

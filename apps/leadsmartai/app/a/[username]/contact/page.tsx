import type { Metadata } from "next";
import { actionHref } from "@/lib/marketing-hub/config";
import HubLeadForm from "../HubLeadForm";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { MobileStickyBar } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/contact — the form, plus call, email and booking. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "contact");
}

export default async function HubContactPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "contact");
  const { hub, L, theme, locale } = loaded;
  const cfg = hub.config;
  const phone = cfg.profile.showPhone ? hub.agent?.phone ?? null : null;
  const email = cfg.profile.showEmail ? hub.agent?.email ?? null : null;
  const bookingHref =
    hub.booking.mode === "off"
      ? null
      : actionHref({ kind: "book", url: null }, { username: hub.username, phone, email, externalBookingUrl: hub.booking.externalUrl });
  return (
    <HubPageFrame loaded={loaded} page="contact">
      <section id="contact" className="bg-slate-50 py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <HubLeadForm
            username={hub.username}
            utmSource={null}
            utmCampaign={null}
            theme={theme}
            phone={phone}
            email={email}
            bookingHref={bookingHref}
            locale={locale}
            labels={L.contact}
          />
        </div>
      </section>
      <MobileStickyBar hub={hub} L={L} theme={theme} />
    </HubPageFrame>
  );
}

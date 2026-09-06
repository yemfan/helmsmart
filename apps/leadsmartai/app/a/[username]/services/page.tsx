import type { Metadata } from "next";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { FinalCta, MobileStickyBar, Services } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/services — every service the agent offers, each with its own button. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "services");
}

export default async function HubServicesPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "services");
  const props = { hub: loaded.hub, L: loaded.L, theme: loaded.theme };
  return (
    <HubPageFrame loaded={loaded} page="services">
      <Services {...props} />
      <FinalCta {...props} />
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

import type { Metadata } from "next";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { FinalCta, MobileStickyBar, OpenHouses } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/open-houses — every upcoming open house, each linking to its sign-in page. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "open-houses");
}

export default async function HubOpenHousesPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "open-houses");
  const props = { hub: loaded.hub, L: loaded.L, theme: loaded.theme };
  return (
    <HubPageFrame loaded={loaded} page="open-houses">
      <OpenHouses {...props} locale={loaded.locale} />
      <FinalCta {...props} />
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

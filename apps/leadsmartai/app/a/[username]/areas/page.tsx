import type { Metadata } from "next";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { Areas, FinalCta, MobileStickyBar } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/areas — every market area, each linking to its own page. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "areas");
}

export default async function HubAreasPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "areas");
  const props = { hub: loaded.hub, L: loaded.L, theme: loaded.theme };
  return (
    <HubPageFrame loaded={loaded} page="areas">
      <Areas {...props} />
      <FinalCta {...props} />
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

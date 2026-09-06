import type { Metadata } from "next";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { HomeValueBand, MobileStickyBar, Tools } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/tools — the free calculators and estimators, plus the home-value funnel. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "tools");
}

export default async function HubToolsPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "tools");
  const props = { hub: loaded.hub, L: loaded.L, theme: loaded.theme };
  return (
    <HubPageFrame loaded={loaded} page="tools">
      <Tools {...props} />
      <HomeValueBand {...props} />
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

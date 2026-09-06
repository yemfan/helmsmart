import type { Metadata } from "next";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { Hero, MobileStickyBar, Trust, Workforce } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/about — who the agent is: bio, facts, credentials, testimonials, the AI team. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "about");
}

export default async function HubAboutPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "about");
  const props = { hub: loaded.hub, L: loaded.L, theme: loaded.theme };
  return (
    <HubPageFrame loaded={loaded} page="about" heading={false}>
      <Hero {...props} bio="full" />
      <Trust {...props} />
      <Workforce {...props} />
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

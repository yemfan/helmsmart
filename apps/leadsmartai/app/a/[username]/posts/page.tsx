import type { Metadata } from "next";
import HubFeed from "../HubFeed";
import { HubPageFrame, hubPageMetadata, loadHubPage } from "../hubPage";
import { Featured, MobileStickyBar } from "../sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** /@handle/posts — the agent's published content, with platform filters. */

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return hubPageMetadata((await params).username, "posts");
}

export default async function HubPostsPage({ params }: Props) {
  const loaded = await loadHubPage((await params).username, "posts");
  const { hub, L, theme } = loaded;
  const props = { hub, L, theme };
  return (
    <HubPageFrame loaded={loaded} page="posts">
      <Featured {...props} />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <HubFeed items={hub.feed} username={hub.username} labels={L.feed} />
        </div>
      </section>
      <MobileStickyBar {...props} />
    </HubPageFrame>
  );
}

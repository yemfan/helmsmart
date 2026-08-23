import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicOpenHouseBySlug } from "@/lib/open-houses/publicService";
import { OpenHouseSigninClient } from "./OpenHouseSigninClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.openHouseSignIn.title", { ns: "web_marketing" });
  return {
  title,
  // Public page — explicitly allow indexing is pointless (slug URLs are
  // shared directly) but don't actively block either.
  robots: { index: false, follow: false },
};
}

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Public open-house sign-in page.
 *
 * Unauthenticated. Intended UX: agent opens this on an iPad at the
 * door, visitors tap "Sign in" and fill the form. Mobile-first.
 *
 * We SSR the open-house info (property address + time window) so
 * the first paint is meaningful and works even on unreliable
 * connections. The form POSTs to /api/public/open-house/[slug]/signin.
 */
export default async function OpenHouseSigninPage({ params }: PageProps) {
  const { slug } = await params;
  const info = await getPublicOpenHouseBySlug(slug);
  if (!info || info.status === "cancelled") notFound();

  return <OpenHouseSigninClient info={info} />;
}

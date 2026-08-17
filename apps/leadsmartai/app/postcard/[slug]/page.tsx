import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPostcardBySlug } from "@/lib/postcards/service";
import { PostcardViewerClient } from "./PostcardViewerClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
// Public-facing, unauthenticated. The slug is the capability.

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const view = await getPublicPostcardBySlug(slug);
  if (!view) return { title: "Postcard", robots: { index: false } };
  const title = view.agentName
    ? `A postcard from ${view.agentName}`
    : "A postcard for you";
  return { title, robots: { index: false, follow: false } };
}

export default async function PublicPostcardPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const t = await getServerT();
  const { slug } = await params;
  const view = await getPublicPostcardBySlug(slug);
  if (!view) notFound();
  return <PostcardViewerClient view={view} slug={slug} />;
}

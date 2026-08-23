import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFeedbackBySlug } from "@/lib/listing-feedback/publicService";
import { FeedbackFormClient } from "./FeedbackFormClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.showingFeedback.title", { ns: "web_marketing" });
  return {
  title,
  robots: { index: false, follow: false },
};
}

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Public cross-agent feedback form. No auth — slug is the capability.
 * Rendered SSR for fast first paint on mobile.
 */
export default async function PublicFeedbackPage({ params }: PageProps) {
  const { slug } = await params;
  const info = await getPublicFeedbackBySlug(slug);
  if (!info) notFound();
  return <FeedbackFormClient info={info} />;
}

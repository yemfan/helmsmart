import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS, legalDocumentByKey } from "@/content/legal";
import { LegalPage } from "@/components/site/legal-page";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

/** The policy documents that do not have a dedicated top-level route. */
const OWN_ROUTES = new Set(["partner-terms", "privacy", "marketing-guidelines"]);

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.filter((d) => !OWN_ROUTES.has(d.key)).map((d) => ({ key: d.key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const doc = legalDocumentByKey(key);
  if (!doc) return { title: "Not found" };
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/legal/${key}` },
  };
}

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (OWN_ROUTES.has(key) || !legalDocumentByKey(key)) notFound();
  return <LegalPage documentKey={key} />;
}

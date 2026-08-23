import Link from "next/link";
import { notFound } from "next/navigation";
import { getLegalDocument } from "@/lib/legal";
import { LEGAL_DOCUMENTS, LEGAL_REVIEW_NOTICE } from "@/content/legal";
import { Container, Section } from "@/components/ui/primitives";
import { Markdown } from "@/components/ui/markdown";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PageHero } from "@/components/site/blocks";

const PATHS: Record<string, string> = {
  "partner-terms": "/terms",
  privacy: "/privacy",
  "marketing-guidelines": "/marketing-guidelines",
  "commission-policy": "/legal/commission-policy",
  "refund-chargeback-policy": "/legal/refund-chargeback-policy",
  "earnings-disclaimer": "/legal/earnings-disclaimer",
};

/** Shared renderer for every legal and policy page. */
export async function LegalPage({ documentKey }: { documentKey: string }) {
  const doc = await getLegalDocument(documentKey);
  if (!doc) notFound();

  return (
    <>
      <PageHero eyebrow="Legal" title={doc.title} lead={doc.summary} />

      <Section tone="light">
        <Container width="narrow">
          {doc.published ? (
            <p className="text-xs text-muted">
              Version {doc.version}
              {doc.effectiveFrom ? ` - effective from ${doc.effectiveFrom}` : ""}.
            </p>
          ) : (
            <Disclaimer label="Draft">{LEGAL_REVIEW_NOTICE}</Disclaimer>
          )}

          <article className="mt-8">
            <Markdown source={doc.bodyMarkdown} />
          </article>

          <nav className="mt-14 border-t border-hairline pt-8" aria-label="Other legal documents">
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
              Related documents
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {LEGAL_DOCUMENTS.filter((d) => d.key !== documentKey).map((d) => (
                <li key={d.key}>
                  <Link
                    href={PATHS[d.key] ?? `/legal/${d.key}`}
                    className="block rounded-xl border border-hairline bg-white px-4 py-3 text-sm font-medium text-navy-700 transition-colors hover:border-navy-300 hover:text-navy-900"
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </Section>
    </>
  );
}

export { PATHS as LEGAL_PATHS };

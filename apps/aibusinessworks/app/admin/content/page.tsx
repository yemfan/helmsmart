import type { Metadata } from "next";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { getLegalDocument } from "@/lib/legal";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { publishLegalDocument } from "../actions";
import { Badge, Card } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Content" };

export default async function AdminContentPage() {
  const documents = await Promise.all(
    LEGAL_DOCUMENTS.map(async (doc) => ({
      draft: doc,
      live: await getLegalDocument(doc.key),
    })),
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Content"
      subtitle="Legal and policy documents. Editing here publishes a new version - no deploy required."
    >
      <div className="space-y-6">
        <Card>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            How publishing works
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Publishing writes a new numbered version with its own effective date. Earlier versions
            are kept, and the public page renders whichever published version is in effect today.
            Partner acceptance is recorded against the specific document version they agreed to.
          </p>
        </Card>

        {documents.map(({ draft, live }) => (
          <details key={draft.key} className="rounded-2xl border border-hairline bg-white shadow-card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-6">
              <span>
                <span className="font-display text-base font-semibold tracking-tight text-ink">
                  {draft.title}
                </span>
                <span className="mt-1 block text-xs text-muted">{draft.summary}</span>
              </span>
              {live?.published ? (
                <Badge tone="success">
                  Published v{live.version}
                  {live.effectiveFrom ? ` · from ${live.effectiveFrom}` : ""}
                </Badge>
              ) : (
                <Badge tone="warning">Unreviewed draft</Badge>
              )}
            </summary>

            <form action={publishLegalDocument} className="border-t border-hairline p-6">
              <input type="hidden" name="key" value={draft.key} />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-500">
                    Title
                  </span>
                  <input
                    type="text"
                    name="title"
                    defaultValue={live?.title ?? draft.title}
                    required
                    className="mt-1.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-500">
                    Effective from
                  </span>
                  <input
                    type="date"
                    name="effectiveFrom"
                    defaultValue={live?.effectiveFrom ?? today}
                    required
                    className="mt-1.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                  />
                </label>
              </div>

              <label className="mt-5 block">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-500">
                  Body (Markdown: ## headings, lists, **bold**)
                </span>
                <textarea
                  name="body"
                  rows={20}
                  required
                  defaultValue={live?.bodyMarkdown ?? draft.bodyMarkdown}
                  className="mt-1.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-navy-400"
                />
              </label>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
                >
                  Publish v{(live?.version ?? 0) + 1}
                </button>
                <p className="text-xs text-muted">
                  This replaces what visitors see. The previous version is retained.
                </p>
              </div>
            </form>
          </details>
        ))}

        <Disclaimer>
          The bundled drafts have not been reviewed by counsel and are structural starting points
          only. The compensation structure and the final business model must be reviewed by
          qualified legal counsel before public launch.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

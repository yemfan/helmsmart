import "server-only";
import { cache } from "react";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";
import { LEGAL_DOCUMENTS, legalDocumentByKey } from "@/content/legal";

export interface ResolvedLegalDocument {
  key: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  version: number;
  effectiveFrom: string | null;
  /** True when the text came from the database rather than the bundled draft. */
  published: boolean;
}

/**
 * Resolve a legal document, database first.
 *
 * Counsel edits and publishes these through the admin dashboard, which writes a
 * new row in `abw_legal_documents` with an incremented version. The bundled
 * draft in `content/legal.ts` is only the fallback, and is clearly labelled as
 * unreviewed wherever it renders.
 */
export const getLegalDocument = cache(
  async (key: string): Promise<ResolvedLegalDocument | null> => {
    const draft = legalDocumentByKey(key);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createPublicClient();
        const { data } = await supabase
          .from("abw_legal_documents")
          .select("key, title, body_markdown, version, effective_from, published_at")
          .eq("key", key)
          .not("published_at", "is", null)
          .lte("effective_from", new Date().toISOString().slice(0, 10))
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          return {
            key: data.key,
            title: data.title,
            summary: draft?.summary ?? "",
            bodyMarkdown: data.body_markdown,
            version: data.version,
            effectiveFrom: data.effective_from,
            published: true,
          };
        }
      } catch {
        // Fall through to the bundled draft.
      }
    }

    if (!draft) return null;
    return {
      key: draft.key,
      title: draft.title,
      summary: draft.summary,
      bodyMarkdown: draft.bodyMarkdown,
      version: 0,
      effectiveFrom: null,
      published: false,
    };
  },
);

export const LEGAL_KEYS = LEGAL_DOCUMENTS.map((d) => d.key);

import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aiExtractContacts, type AiExtractInput, type ImageMediaType } from "@/lib/contact-intake/aiExtractContacts";
import { runContactIngestion } from "@/lib/contact-intake/ingestionPipeline";
import { defineTool } from "../types";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

/** Fold company/title/notes into the single contacts.notes column (mirrors the
 *  import-file/save route). */
function composeNotes(c: { company?: string | null; title?: string | null; notes?: string | null }): string | null {
  const parts: string[] = [];
  if (c.company?.trim() && c.title?.trim()) parts.push(`${c.title.trim()} @ ${c.company.trim()}`);
  else if (c.company?.trim()) parts.push(c.company.trim());
  else if (c.title?.trim()) parts.push(c.title.trim());
  if (c.notes?.trim()) parts.push(c.notes.trim());
  return parts.length ? parts.join(" — ") : null;
}

const IMAGE_MEDIA: Record<string, ImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export const importContactsFromFile = defineTool({
  name: "import_contacts_from_file",
  description:
    "Import contacts from a file the agent uploaded — a CSV, a photo of a sign-in sheet / business cards, or a PDF roster. Pass the file's storage path (from the attachment reference in the objective). Reads it, extracts every contact, and adds them to the CRM, skipping duplicates. Excel files must be saved as CSV first.",
  inputSchema: z.object({
    storage_path: z
      .string()
      .min(1)
      .describe("The lead-media storage path of the uploaded file, from the attachment reference in the objective."),
    file_name: z.string().optional().describe("Original file name, for the summary."),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    // Pro gate — AI extraction costs a model call (matches import-file/save).
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type")
      .eq("id", ctx.agentId)
      .maybeSingle();
    const planType = String((agentRow as { plan_type?: string | null } | null)?.plan_type ?? "free");
    if (planType.toLowerCase() === "free") {
      return { status: "failed", error: "Importing contacts from a file needs a Pro plan." };
    }

    const path = input.storage_path.replace(/^lead-media\//, "");
    const dl = await supabaseAdmin.storage.from("lead-media").download(path);
    if (dl.error || !dl.data) {
      return { status: "failed", error: `Couldn't read the uploaded file (${dl.error?.message ?? "not found"}).` };
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const ext = (input.file_name ?? path).toLowerCase().split(".").pop() ?? "";

    let extractInput: AiExtractInput;
    if (["csv", "txt", "tsv", "vcf", "md"].includes(ext)) {
      extractInput = { kind: "text", text: new TextDecoder().decode(bytes) };
    } else if (ext === "pdf") {
      extractInput = { kind: "pdf", bytes };
    } else if (IMAGE_MEDIA[ext]) {
      extractInput = { kind: "image", bytes, mediaType: IMAGE_MEDIA[ext] };
    } else {
      return { status: "failed", error: "I can import from a CSV, a PDF, or a photo. Please save Excel files as CSV first." };
    }

    let drafts;
    try {
      drafts = await aiExtractContacts(extractInput, await agentUiLocale(ctx.agentId));
    } catch (e) {
      return { status: "failed", error: `I couldn't read contacts from that file: ${e instanceof Error ? e.message : "extraction failed"}.` };
    }
    if (drafts.length === 0) {
      return { status: "completed", summary: "I didn't find any contacts in that file." };
    }

    let inserted = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;
    for (const c of drafts.slice(0, 200)) {
      const name = (c.name ?? "").trim() || null;
      const email = (c.email ?? "").trim() || null;
      const phone = (c.phone ?? "").trim() || null;
      if (!name && !email && !phone) {
        skipped += 1;
        continue;
      }
      try {
        const r = await runContactIngestion({
          agentId: ctx.agentId,
          planType,
          fields: {
            name,
            email,
            phone,
            property_address: (c.address ?? "").trim() || null,
            notes: composeNotes(c),
            source: "ai_file_extract",
          },
          intakeChannel: "manual_batch",
          duplicateStrategy: "skip",
          skipEnrichment: true,
        });
        if (r.action === "inserted") inserted += 1;
        else if (r.action === "merged") merged += 1;
        else skipped += 1;
      } catch {
        errors += 1;
      }
    }

    const bits = [`${inserted} new`];
    if (merged) bits.push(`${merged} updated`);
    if (skipped) bits.push(`${skipped} skipped`);
    return {
      status: "completed",
      summary: `Imported contacts from ${input.file_name ?? "your file"}: ${bits.join(", ")}.`,
      // `bits` is already-composed English detail; the headline is what a
      // person skimming the step list actually needs.
      display: { key: "contacts.imported", params: { file: input.file_name ?? "" } },
      data: { inserted, merged, skipped, errors },
    };
  },
});

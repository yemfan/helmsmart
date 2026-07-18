import Papa from "papaparse";

import { supabaseAdmin } from "@/lib/supabase/admin";

import { findBestDuplicateMatchForAgent } from "./findDuplicateCandidates";
import { rowToContactFields, type ColumnMapping } from "./csvMap";
import { runContactIngestion } from "./ingestionPipeline";
import { toLeadLike } from "./leadLike";
import type { ContactFieldsInput, DuplicateStrategy, IntakeChannel } from "./types";

export type ImportJobRow = {
  id: string;
  job_id: string;
  row_index: number;
  raw_payload: Record<string, string>;
  normalized_payload: ContactFieldsInput | null;
  duplicate_contact_id: string | null;
  duplicate_confidence: number | null;
  resolution: string;
  contact_id: string | null;
  error_message: string | null;
};

function asStringRecord(row: unknown): Record<string, string> {
  if (!row || typeof row !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h).trim(),
  });

  if (parsed.errors.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "FieldMismatch");
    if (fatal) throw new Error(fatal.message || "CSV parse error");
  }

  const rows = (parsed.data ?? []).map((r) => asStringRecord(r));
  const headers =
    parsed.meta.fields?.map((h) => String(h).trim()).filter(Boolean) ??
    (rows[0] ? Object.keys(rows[0]) : []);

  return { headers, rows };
}

export async function createImportJobFromCsv(params: {
  agentId: string;
  userId: string | null;
  fileName: string;
  rows: Record<string, string>[];
}): Promise<{ jobId: string }> {
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("contact_import_jobs")
    .insert({
      agent_id: params.agentId,
      created_by: params.userId,
      intake_channel: "csv",
      status: "mapping",
      file_name: params.fileName,
      column_mapping: {},
    } as Record<string, unknown>)
    .select("id")
    .single();

  if (jobErr) throw jobErr;
  const jobId = String((job as { id?: string }).id ?? "");
  if (!jobId) throw new Error("Failed to create import job");

  const payload = params.rows.map((raw, idx) => ({
    job_id: jobId,
    row_index: idx,
    raw_payload: raw,
    resolution: "pending",
  }));

  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from("contact_import_rows").insert(slice as never);
    if (error) throw error;
  }

  return { jobId };
}

export async function previewImportJob(params: {
  agentId: string;
  jobId: string;
  mapping: ColumnMapping;
  duplicateStrategy: DuplicateStrategy;
}): Promise<{ preview: ImportJobRow[]; stats: { total: number; likelyDuplicates: number } }> {
  const { jobId, mapping, agentId } = params;

  const { data: job, error: jErr } = await supabaseAdmin
    .from("contact_import_jobs")
    .select("id, agent_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jErr) throw jErr;
  if (!job || String((job as { agent_id?: string }).agent_id) !== agentId) {
    throw new Error("Import job not found");
  }

  await supabaseAdmin
    .from("contact_import_jobs")
    .update({
      column_mapping: mapping,
      status: "preview",
      duplicate_strategy: params.duplicateStrategy,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId);

  const { data: rows, error: rErr } = await supabaseAdmin
    .from("contact_import_rows")
    .select("id, job_id, row_index, raw_payload, resolution")
    .eq("job_id", jobId)
    .order("row_index", { ascending: true });

  if (rErr) throw rErr;

  let likelyDuplicates = 0;
  const preview: ImportJobRow[] = [];

  for (const r of rows ?? []) {
    const raw = asStringRecord((r as { raw_payload?: unknown }).raw_payload);
    const fields = rowToContactFields(raw, mapping);
    const incoming = toLeadLike(fields, agentId);
    const dup = await findBestDuplicateMatchForAgent(agentId, incoming);

    const dupId = dup?.leadId ?? null;
    const dupScore = dup?.score ?? null;
    if (dupId) likelyDuplicates += 1;

    const normalized_payload = fields;

    await supabaseAdmin
      .from("contact_import_rows")
      .update({
        normalized_payload,
        duplicate_contact_id: dupId,
        duplicate_confidence: dupScore,
      } as never)
      .eq("id", (r as { id: string }).id);

    preview.push({
      id: String((r as { id: string }).id),
      job_id: jobId,
      row_index: Number((r as { row_index: number }).row_index),
      raw_payload: raw,
      normalized_payload,
      duplicate_contact_id: dupId,
      duplicate_confidence: dupScore,
      resolution: "pending",
      contact_id: null,
      error_message: null,
    });
  }

  return {
    preview: preview.slice(0, 100),
    stats: { total: rows?.length ?? 0, likelyDuplicates },
  };
}

export async function finalizeImportJob(params: {
  agentId: string;
  planType: string;
  jobId: string;
  duplicateStrategy: DuplicateStrategy;
  enrichRows?: boolean;
}): Promise<{
  inserted: number;
  merged: number;
  skipped: number;
  errors: number;
}> {
  const { jobId, agentId, planType, duplicateStrategy } = params;
  const skipEnrichment = params.enrichRows !== true;

  const { data: job, error: jErr } = await supabaseAdmin
    .from("contact_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jErr) throw jErr;
  if (!job || String((job as { agent_id?: string }).agent_id) !== agentId) {
    throw new Error("Import job not found");
  }

  await supabaseAdmin
    .from("contact_import_jobs")
    .update({
      status: "processing",
      duplicate_strategy: duplicateStrategy,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId);

  const { data: rows, error: rErr } = await supabaseAdmin
    .from("contact_import_rows")
    .select("*")
    .eq("job_id", jobId)
    .order("row_index", { ascending: true });

  if (rErr) throw rErr;

  let inserted = 0;
  let merged = 0;
  let skipped = 0;
  let errors = 0;

  const mapping = (job as { column_mapping?: ColumnMapping }).column_mapping ?? {};

  for (const r of rows ?? []) {
    const raw = asStringRecord((r as { raw_payload?: unknown }).raw_payload);
    const fields =
      (r as { normalized_payload?: ContactFieldsInput | null }).normalized_payload ??
      rowToContactFields(raw, mapping);

    if (!fields.name && !fields.email && !fields.phone) {
      await supabaseAdmin
        .from("contact_import_rows")
        .update({
          resolution: "error",
          error_message: "Empty row",
        } as never)
        .eq("id", (r as { id: string }).id);
      errors += 1;
      continue;
    }

    try {
      const result = await runContactIngestion({
        agentId,
        planType,
        fields: {
          ...fields,
          // Preserve the CRM's own Lead Source when mapped; only fall back to
          // the intake channel when the CSV didn't carry one. (intake_channel
          // already records that this came in via CSV.)
          source: fields.source?.trim() || "csv_import",
        },
        intakeChannel: "csv_import" as IntakeChannel,
        duplicateStrategy,
        importJobId: jobId,
        skipEnrichment,
      });

      if (result.action === "skipped") {
        await supabaseAdmin
          .from("contact_import_rows")
          .update({
            resolution: "skipped",
            duplicate_contact_id: result.duplicateLeadId,
            duplicate_confidence: result.score,
          } as never)
          .eq("id", (r as { id: string }).id);
        skipped += 1;
      } else if (result.action === "merged") {
        await supabaseAdmin
          .from("contact_import_rows")
          .update({
            resolution: "merged",
            contact_id: result.leadId,
          } as never)
          .eq("id", (r as { id: string }).id);
        merged += 1;
      } else {
        await supabaseAdmin
          .from("contact_import_rows")
          .update({
            resolution: "inserted",
            contact_id: result.leadId,
          } as never)
          .eq("id", (r as { id: string }).id);
        inserted += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      await supabaseAdmin
        .from("contact_import_rows")
        .update({
          resolution: "error",
          error_message: msg,
        } as never)
        .eq("id", (r as { id: string }).id);
      errors += 1;
    }
  }

  await supabaseAdmin
    .from("contact_import_jobs")
    .update({
      status: "completed",
      summary: { inserted, merged, skipped, errors, finished_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId);

  return { inserted, merged, skipped, errors };
}

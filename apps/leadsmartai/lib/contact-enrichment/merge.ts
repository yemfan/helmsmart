import type { LeadLike } from "./types";
import { displayAddress, displayPhone } from "./normalize";

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/**
 * Field updates for the surviving (primary) lead after merging duplicate into it.
 */
export function mergeLeadRecords(primary: LeadLike, duplicate: LeadLike): Record<string, unknown> {
  const name =
    (typeof primary.name === "string" && primary.name.trim()) ||
    (typeof duplicate.name === "string" && duplicate.name.trim()) ||
    null;
  const email =
    (typeof primary.email === "string" && primary.email.trim()) ||
    (typeof duplicate.email === "string" && duplicate.email.trim()) ||
    null;
  const phone =
    displayPhone(primary) ||
    displayPhone(duplicate) ||
    null;
  const property_address =
    displayAddress(primary) ||
    displayAddress(duplicate) ||
    null;
  const city =
    (typeof primary.city === "string" && primary.city.trim()) ||
    (typeof duplicate.city === "string" && duplicate.city.trim()) ||
    null;
  const state =
    (typeof primary.state === "string" && primary.state.trim()) ||
    (typeof duplicate.state === "string" && duplicate.state.trim()) ||
    null;
  const zip_code =
    (typeof primary.zip_code === "string" && primary.zip_code.trim()) ||
    (typeof duplicate.zip_code === "string" && duplicate.zip_code.trim()) ||
    null;
  const birthday = primary.birthday ?? duplicate.birthday ?? null;
  const home_purchase_date = primary.home_purchase_date ?? duplicate.home_purchase_date ?? null;
  const preferred_contact_channel =
    (typeof primary.preferred_contact_channel === "string" && primary.preferred_contact_channel.trim()) ||
    (typeof duplicate.preferred_contact_channel === "string" && duplicate.preferred_contact_channel.trim()) ||
    null;
  const relationship_stage =
    (typeof primary.relationship_stage === "string" && primary.relationship_stage.trim()) ||
    (typeof duplicate.relationship_stage === "string" && duplicate.relationship_stage.trim()) ||
    null;
  const mailing_address =
    (typeof primary.mailing_address === "string" && primary.mailing_address.trim()) ||
    (typeof duplicate.mailing_address === "string" && duplicate.mailing_address.trim()) ||
    null;

  const nsP = typeof primary.notes_summary === "string" ? primary.notes_summary.trim() : "";
  const nsD = typeof duplicate.notes_summary === "string" ? duplicate.notes_summary.trim() : "";
  const notesP = typeof primary.notes === "string" ? primary.notes.trim() : "";
  const notesD = typeof duplicate.notes === "string" ? duplicate.notes.trim() : "";

  const notes_summary =
    [nsP, nsD].filter(Boolean).join("\n\n") || null;
  const notesCombined = [notesP, notesD].filter(Boolean).join("\n\n") || null;
  const notesFallback =
    (typeof primary.notes === "string" && primary.notes.trim()) ||
    (typeof duplicate.notes === "string" && duplicate.notes.trim()) ||
    null;

  const tags = Array.from(
    new Set([...parseTags(primary.lead_tags_json), ...parseTags(duplicate.lead_tags_json)])
  );

  return {
    name,
    email,
    phone,
    property_address,
    city,
    state,
    zip_code,
    birthday,
    home_purchase_date,
    preferred_contact_channel,
    relationship_stage,
    mailing_address,
    notes_summary: notes_summary || null,
    notes: notesCombined || notesFallback,
    lead_tags_json: tags,
  };
}

export type IntakeChannel =
  | "manual"
  | "csv_import"
  | "business_card"
  | "manual_batch"
  | "device_contacts";
export type DuplicateStrategy = "skip" | "merge" | "create_anyway";

export type ContactFieldsInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  property_address?: string | null;
  notes?: string | null;
  source?: string | null;
};

export type IngestResult =
  | { action: "inserted"; leadId: string }
  | { action: "skipped"; duplicateLeadId: string; score: number }
  | { action: "merged"; leadId: string };

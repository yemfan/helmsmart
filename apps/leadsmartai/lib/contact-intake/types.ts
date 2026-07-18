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
  // Richer CRM-export fields (smart import). Text unless noted.
  /** buyer | seller | renter — normalized from the source CRM's value. */
  lead_type?: string | null;
  /** Area of interest (city/neighborhood they're buying/renting in). */
  search_location?: string | null;
  city?: string | null;
  state?: string | null;
  timeline?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  beds?: number | null;
  baths?: number | null;
  tags?: string[] | null;
};

export type IngestResult =
  | { action: "inserted"; leadId: string }
  | { action: "skipped"; duplicateLeadId: string; score: number }
  | { action: "merged"; leadId: string };

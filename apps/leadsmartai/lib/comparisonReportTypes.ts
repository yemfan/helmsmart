import type { PropertyInput, PropertyScoreResult } from "@/lib/propertyScoring";

export type AgentSnapshot = {
  display_name: string | null;
  email: string | null;
  phone: string | null;
  brokerage: string | null;
  license_number?: string | null;
  photo_url?: string | null;
  logo_url?: string | null;
};

export type ComparisonReportResult = {
  agent_snapshot: AgentSnapshot;
  executive_summary: string;
  best_property_id: string;
  best_property_explanation: string;
  pros: string[];
  cons: string[];
  scored: Array<{
    property: PropertyInput;
    score: PropertyScoreResult;
  }>;
};

export type ComparisonReportRow = {
  id: string;
  agent_id: string;
  client_name: string;
  properties: PropertyInput[];
  result: ComparisonReportResult;
  created_at: string;
};

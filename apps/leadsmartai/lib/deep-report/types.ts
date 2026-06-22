import type { Affordability, InvestmentReturns } from "./finance";
import type { PresentationSchool } from "@/lib/presentationAI";

/**
 * Property Deep Report — a comprehensive buyer-decision report. Combines the
 * AI CMA (value + comps), a loan-affordability calculation, an AI deal
 * rating, investment ROI (when the property use is investment), schools +
 * neighborhood, a location map, and the agent profile.
 */

export type PropertyUse = "primary" | "second_home" | "investment";

export type DealRating = {
  /** Letter grade A–F. */
  grade: string;
  /** 0–100 score. */
  score: number | null;
  /** One short paragraph on why. */
  rationale: string;
};

export type DeepReportProperty = {
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  lotSizeSqft: number | null;
  hoaMonthly: number | null;
};

export type DeepReportAgent = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
};

export type DeepReport = {
  propertyUse: PropertyUse;
  property: DeepReportProperty;
  estimate: {
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
    avgPricePerSqft: number | null;
    summary: string;
  };
  comps: Array<{
    address: string;
    price: number | null;
    sqft: number | null;
    pricePerSqft: number | null;
    soldDate: string | null;
  }>;
  affordability: Affordability;
  dealRating: DealRating;
  /** Present only when propertyUse === "investment". */
  investment: (InvestmentReturns & { rentSummary: string | null }) | null;
  schools: PresentationSchool[];
  neighborhood: string;
  /** Base64 location map (data URL) + jsPDF format; null when unavailable. */
  locationMap: { dataUrl: string; format: "JPEG" | "PNG" } | null;
  agent: DeepReportAgent;
  sources: { title: string; url: string }[];
  disclaimer: string;
};

export const DEEP_REPORT_DISCLAIMER =
  "AI-generated estimate from public web data. Value, rent, affordability, and deal metrics are opinions for planning only — not an appraisal, loan approval, or investment advice. Verify figures and consult a lender / advisor before deciding.";

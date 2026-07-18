/**
 * Shared types for the Data Center research engine. These mirror the JSON shape
 * Claude returns and the `research_reports` table columns. Kept framework-free
 * (no server-only import) so both server generators and client/RSC render code
 * can consume them.
 */

export type ResearchKind = "weekly_rates" | "monthly_market";

/** A cited source that grounds the report's numbers. */
export type ResearchSource = {
  title: string;
  url: string;
  publisher: string;
};

/** A headline stat, tied to a source by index into the sources array. */
export type ResearchKeyStat = {
  label: string;
  value: string;
  /** Index into `sources`; -1 (or out of range) means uncited. */
  sourceIndex: number;
};

/** An optional tabular data block. */
export type ResearchDataTable = {
  caption: string;
  columns: string[];
  rows: string[][];
};

/** One narrative section (heading + paragraphs). */
export type ResearchSection = {
  heading: string;
  paragraphs: string[];
};

export type ResearchFaq = {
  q: string;
  a: string;
};

/** A single framing of the analysis (consumer OR agent). Same data, different lens. */
export type ResearchAnalysis = {
  sections: ResearchSection[];
  faqs: ResearchFaq[];
};

/** The full generated report (pre-persistence). */
export type ResearchReport = {
  kind: ResearchKind;
  title: string;
  dek: string | null;
  periodLabel: string | null;
  keyStats: ResearchKeyStat[];
  dataTable: ResearchDataTable | null;
  sources: ResearchSource[];
  analysisConsumer: ResearchAnalysis;
  analysisAgent: ResearchAnalysis;
};

/** A persisted row from `research_reports`. */
export type ResearchReportRow = {
  id: string;
  kind: ResearchKind;
  slug: string;
  title: string;
  dek: string | null;
  period_label: string | null;
  key_stats: ResearchKeyStat[] | null;
  data_table: ResearchDataTable | null;
  sources: ResearchSource[] | null;
  analysis_consumer: ResearchAnalysis;
  analysis_agent: ResearchAnalysis;
  published_date: string;
  status: string;
  created_at: string;
  updated_at: string;
};

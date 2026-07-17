// Shared domain types for SwipenDone. Text is locale-keyed (see lib/locales.ts).

import type { Locale, LocalizedText } from "@/lib/locales";

export type { Locale, LocalizedText };
export type GuideStatus = "draft" | "published" | "archived";

/** Per-locale cover-card metadata. */
export interface MetaFields {
  time_estimate?: string;
  people?: string;
  tools?: string;
}
export type GuideMeta = Partial<Record<Locale, MetaFields>>;

export interface Part {
  code: string;
  name: LocalizedText;
  qty: number;
}

export interface Step {
  id?: string;
  guide_id?: string;
  position: number;
  title: LocalizedText;
  body: LocalizedText;
  tip: LocalizedText;
  image_url: string | null;
}

export interface Guide {
  id: string;
  product_id: string;
  slug: string | null;
  status: GuideStatus;
  version: number;
  languages: Locale[];
  meta: GuideMeta;
  parts: Part[];
  published_at: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  name: LocalizedText;
  model_no: string | null;
  created_at: string;
}

/** Shape of a full guide as rendered to a buyer. */
export interface GuideBundle {
  guide: Guide;
  product: { name: LocalizedText; model_no: string | null };
  brand_name: string | null;
  steps: Step[];
}

/** Strict JSON contract returned by /api/generate (validated with zod). */
export interface GeneratedGuide {
  name: LocalizedText;
  meta: GuideMeta;
  parts: Array<{ code: string; qty: number; name: LocalizedText }>;
  steps: Array<{
    title: LocalizedText;
    body: LocalizedText;
    tip: LocalizedText;
    image_index: number | null;
  }>;
}

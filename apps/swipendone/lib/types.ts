// Shared domain types for SwipenDone. Mirrors the DB schema (handoff §4).

export type Lang = "en" | "zh";
export type GuideStatus = "draft" | "published" | "archived";

export interface GuideMeta {
  time_estimate?: string;
  people?: string;
  tools?: string;
}

export interface Part {
  code: string;
  name_en: string;
  name_zh?: string;
  qty: number;
}

export interface Step {
  id?: string;
  guide_id?: string;
  position: number;
  title_en: string | null;
  title_zh: string | null;
  body_en: string | null;
  body_zh: string | null;
  tip_en: string | null;
  tip_zh: string | null;
  image_url: string | null;
}

export interface Guide {
  id: string;
  product_id: string;
  slug: string | null;
  status: GuideStatus;
  version: number;
  meta_en: GuideMeta;
  meta_zh: GuideMeta;
  parts: Part[];
  published_at: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  name_en: string;
  name_zh: string | null;
  model_no: string | null;
  created_at: string;
}

/** Shape of a full guide as rendered to a buyer. */
export interface GuideBundle {
  guide: Guide;
  product: Pick<Product, "name_en" | "name_zh" | "model_no">;
  brand_name: string | null;
  steps: Step[];
}

/** Strict JSON contract returned by /api/generate (validated with zod). */
export interface GeneratedGuide {
  meta_en: GuideMeta;
  meta_zh: GuideMeta;
  parts: Part[];
  steps: Array<{
    title_en: string;
    title_zh: string;
    body_en: string;
    body_zh: string;
    tip_en: string;
    tip_zh: string;
    image_index: number | null;
  }>;
}

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SeoGeneratedPage, SeoGeneratorInput } from "./types";

const TABLE = "seo_pages";

export type SeoPageRow = {
  id: string;
  slug: string;
  template: string;
  city: string;
  state: string;
  zip: string | null;
  max_price: number | null;
  beds: number | null;
  property_type: string | null;
  money_keyword: string | null;
  money_keyword_slug: string | null;
  title: string;
  meta_title: string;
  meta_description: string;
  h1: string;
  intro: string;
  stats_json: unknown[];
  faq_json: unknown[];
  internal_links_json: unknown[];
  listings_query_json: Record<string, unknown>;
  calculator_cta_json: Record<string, unknown>;
  page_json: Record<string, unknown>;
  status: string;
  generation_version: number;
  last_generated_at: string;
  last_indexed_at: string | null;
  last_visited_at: string | null;
  visit_count: number;
  lead_count: number;
  revenue_amount: number;
  created_at: string;
  updated_at: string;
};

function isMissingSeoTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("seo_pages") && (m.includes("does not exist") || m.includes("schema cache"));
}

export function mapGeneratedPageToRow(input: SeoGeneratorInput, page: SeoGeneratedPage) {
  const now = new Date().toISOString();
  /**
   * Do not send `money_keyword` / `money_keyword_slug` unless the DB has those columns
   * (see migration `20260443000000_seo_money_keyword_leads_attribution.sql`). Money-keyword
   * copy still lives on `page_json`. Add the columns in Supabase to denormalize for analytics.
   */
  return {
    slug: page.slug,
    template: page.template,
    city: input.city,
    state: input.state,
    zip: input.zip ?? null,
    max_price: input.maxPrice ?? null,
    beds: input.beds ?? null,
    property_type: input.propertyType ?? null,
    title: page.title,
    meta_title: page.metaTitle,
    meta_description: page.metaDescription,
    h1: page.h1,
    intro: page.intro,
    stats_json: page.stats,
    faq_json: page.faq,
    internal_links_json: page.internalLinks,
    listings_query_json: page.listingsQuery,
    calculator_cta_json: page.calculatorCta,
    page_json: page as unknown as Record<string, unknown>,
    status: "published",
    last_generated_at: now,
    updated_at: now,
  };
}

export async function upsertSeoPage(input: SeoGeneratorInput, page: SeoGeneratedPage): Promise<SeoPageRow> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  }

  const base = mapGeneratedPageToRow(input, page);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from(TABLE)
    .select("id,visit_count,lead_count,revenue_amount,generation_version,created_at")
    .eq("slug", base.slug)
    .maybeSingle();

  if (fetchErr && !isMissingSeoTable(fetchErr.message)) {
    throw fetchErr;
  }

  const ex = existing as
    | {
        id?: string;
        visit_count?: number;
        lead_count?: number;
        revenue_amount?: number;
        generation_version?: number;
        created_at?: string;
      }
    | null
    | undefined;

  const row: Record<string, unknown> = {
    ...base,
    visit_count: ex?.visit_count ?? 0,
    lead_count: ex?.lead_count ?? 0,
    revenue_amount: ex?.revenue_amount ?? 0,
    generation_version: (ex?.generation_version ?? 0) + 1,
  };

  if (ex?.id) {
    row.id = ex.id;
    row.created_at = ex.created_at;
  }

  const { data, error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: "slug" }).select().single();

  if (error) throw error;
  return data as SeoPageRow;
}

export async function getSeoPageBySlugFromDb(slug: string): Promise<SeoPageRow | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;

  const normalized = slug.trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("slug", normalized)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    if (!isMissingSeoTable(error.message)) {
      console.warn("[seo_pages] getSeoPageBySlugFromDb:", error.message);
    }
    return null;
  }

  return data as SeoPageRow | null;
}

/**
 * Updates mirrored copy fields + `page_json` for an existing published row (e.g. optimizer pass).
 * Does not change slug, city, attribution columns, or counters.
 */
export async function updateSeoPageFromGeneratedPage(slug: string, page: SeoGeneratedPage): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return false;

  const normalized = slug.trim().toLowerCase();
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      title: page.title,
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
      h1: page.h1,
      intro: page.intro,
      stats_json: page.stats,
      faq_json: page.faq,
      internal_links_json: page.internalLinks,
      listings_query_json: page.listingsQuery,
      calculator_cta_json: page.calculatorCta,
      page_json: page as unknown as Record<string, unknown>,
      updated_at: now,
      last_generated_at: now,
    })
    .eq("slug", normalized)
    .eq("status", "published");

  if (error) {
    console.warn("[seo_pages] updateSeoPageFromGeneratedPage:", error.message);
    return false;
  }

  return true;
}

export async function listSeoPages(limit = 100) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("slug, template, city, state, visit_count, lead_count, revenue_amount, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingSeoTable(error.message)) {
      console.warn("[seo_pages] listSeoPages:", error.message);
    }
    return [];
  }

  return data ?? [];
}

export async function listSeoPagesForSitemap(limit = 5000) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("slug, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingSeoTable(error.message)) {
      console.warn("[seo_pages] listSeoPagesForSitemap:", error.message);
    }
    return [];
  }

  return data ?? [];
}

export type StaleSeoPageRow = {
  slug: string;
  template: string;
  city: string;
  state: string;
  zip: string | null;
  max_price: number | null;
  beds: number | null;
  property_type: string | null;
  money_keyword: string | null;
  money_keyword_slug: string | null;
};

export async function findStaleSeoPages(hours = 168, limit = 200): Promise<StaleSeoPageRow[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("slug, template, city, state, zip, max_price, beds, property_type")
    .lt("last_generated_at", cutoff)
    .eq("status", "published")
    .order("last_generated_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (!isMissingSeoTable(error.message)) {
      console.warn("[seo_pages] findStaleSeoPages:", error.message);
    }
    return [];
  }

  return (data ?? []) as StaleSeoPageRow[];
}

/**
 * Bump a page's visit counter.
 *
 * One atomic statement, not the SELECT-then-UPDATE this used to be. That shape
 * cost two round trips on every view of a public page — and since these routes
 * are uncached and crawler-facing, it was a top consumer in pg_stat_statements
 * and helped starve the shared database. It also lost concurrent increments:
 * two simultaneous views each read N and each wrote N+1, so the busiest pages
 * under-counted the most.
 *
 * Still fire-and-forget: analytics must never delay or break a page render.
 */
export async function incrementSeoPageVisit(slug: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  try {
    await supabaseAdmin.rpc("increment_seo_page_visit", { p_slug: slug });
  } catch {
    /* non-blocking */
  }
}

export async function incrementSeoRevenue(slug: string, amount: number): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  const normalized = slug.trim().toLowerCase();
  try {
    const { data: row, error: selErr } = await supabaseAdmin
      .from(TABLE)
      .select("revenue_amount")
      .eq("slug", normalized)
      .maybeSingle();

    if (selErr || !row) return;

    const next = Number((row as { revenue_amount?: number }).revenue_amount || 0) + amount;
    await supabaseAdmin.from(TABLE).update({ revenue_amount: next }).eq("slug", normalized);
  } catch {
    /* non-blocking */
  }
}

export async function getTopSeoPagesByRevenue(limit = 20) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("slug, visit_count, lead_count, revenue_amount")
    .eq("status", "published")
    .order("revenue_amount", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingSeoTable(error.message)) {
      console.warn("[seo_pages] getTopSeoPagesByRevenue:", error.message);
    }
    return [];
  }

  return data ?? [];
}

/** Call when a lead is attributed to a programmatic SEO URL (e.g. referrer or stored `seo_slug`). */
export async function incrementSeoPageLead(slug: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  const normalized = slug.trim().toLowerCase();
  try {
    const { data: row, error: selErr } = await supabaseAdmin
      .from(TABLE)
      .select("lead_count")
      .eq("slug", normalized)
      .maybeSingle();

    if (selErr || !row) return;

    const next = Number((row as { lead_count?: number }).lead_count || 0) + 1;
    await supabaseAdmin.from(TABLE).update({ lead_count: next }).eq("slug", normalized);
  } catch {
    /* non-blocking */
  }
}

/** Persists each input as a full row (same as batch job, without importing batch to avoid cycles). */
export async function upsertSeoPagesFromInputs(
  inputs: SeoGeneratorInput[]
): Promise<{ inserted: number; error?: string }> {
  if (!inputs.length) return { inserted: 0 };
  const { generateSeoPageContent } = await import("./content");
  let ok = 0;
  let lastErr: string | undefined;
  for (const input of inputs) {
    try {
      const page = await generateSeoPageContent(input);
      await upsertSeoPage(input, page);
      ok++;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Generation failed";
    }
  }
  return { inserted: ok, ...(lastErr !== undefined && ok < inputs.length ? { error: lastErr } : {}) };
}

/** Alias for {@link incrementSeoPageLead}. */
export const incrementSeoLead = incrementSeoPageLead;

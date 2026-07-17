import { createAdminClient, createAnonServerClient } from "@/lib/supabase/admin";
import type { GuideBundle, Guide, Part, Step } from "@/lib/types";
import { LOCALES, type Locale } from "@/lib/locales";

/**
 * Fetch a published guide + product + brand + ordered steps for the public buyer
 * view. Uses the anon client (RLS restricts to published guides). Falls back to
 * the admin client when only the service role is configured. Returns null when
 * not found / not published.
 */
export async function getPublishedGuide(slug: string): Promise<GuideBundle | null> {
  const db = createAnonServerClient() ?? createAdminClient();
  if (!db) return null;

  const { data: guide, error } = await db
    .from("guides")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !guide) return null;

  const g = guide as Guide;

  const [{ data: product }, { data: steps }] = await Promise.all([
    db.from("products").select("name, model_no, seller_id").eq("id", g.product_id).maybeSingle(),
    db.from("steps").select("*").eq("guide_id", g.id).order("position", { ascending: true }),
  ]);

  if (!product) return null;

  // brand_name lives on sellers; readable via admin (anon has no seller read policy).
  let brand_name: string | null = null;
  const admin = createAdminClient();
  if (admin && product.seller_id) {
    const { data: seller } = await admin
      .from("sellers")
      .select("brand_name")
      .eq("id", product.seller_id)
      .maybeSingle();
    brand_name = seller?.brand_name ?? null;
  }

  const languages = (Array.isArray(g.languages) ? g.languages : [])
    .filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));

  return {
    guide: {
      ...g,
      languages: languages.length ? languages : ["en"],
      meta: g.meta || {},
      parts: (g.parts as Part[]) || [],
    },
    product: {
      name: product.name || {},
      model_no: product.model_no,
    },
    brand_name,
    steps: (steps as Step[]) || [],
  };
}

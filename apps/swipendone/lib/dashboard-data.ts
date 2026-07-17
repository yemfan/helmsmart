import { createClient } from "@/lib/supabase/server";
import type { Guide, LocalizedText, Part, Step } from "@/lib/types";
import { LOCALES, pick, type Locale } from "@/lib/locales";

export interface GuideListItem {
  id: string;
  name: string;
  status: string;
  slug: string | null;
  created_at: string;
  scans7d: number;
}

export interface GuideEdit {
  guide: Guide;
  product: { id: string; name: LocalizedText; model_no: string | null };
  steps: Step[];
}

export interface GuideAnalytics {
  scans: number;
  finished: number;
  completionRate: number;
  perStepViews: { position: number; views: number }[];
}

/** Guides owned by the signed-in seller, with 7-day scan counts. */
export async function listGuides(): Promise<GuideListItem[]> {
  const db = await createClient();
  if (!db) return [];

  const { data: guides } = await db
    .from("guides")
    .select("id, status, slug, created_at, products!inner(name)")
    .order("created_at", { ascending: false });
  if (!guides) return [];

  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const items: GuideListItem[] = [];
  for (const g of guides as unknown as Array<Record<string, unknown>>) {
    const { count } = await db
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", g.id as string)
      .gte("created_at", since);
    const product = g.products as { name: LocalizedText } | { name: LocalizedText }[];
    const nameMap = Array.isArray(product) ? product[0]?.name : product?.name;
    items.push({
      id: g.id as string,
      status: g.status as string,
      slug: (g.slug as string) ?? null,
      created_at: g.created_at as string,
      name: pick(nameMap, "en") || "Untitled",
      scans7d: count ?? 0,
    });
  }
  return items;
}

/** Full guide for the editor. RLS guarantees the caller owns it. */
export async function getGuideForEdit(guideId: string): Promise<GuideEdit | null> {
  const db = await createClient();
  if (!db) return null;

  const { data: guide } = await db.from("guides").select("*").eq("id", guideId).maybeSingle();
  if (!guide) return null;
  const g = guide as Guide;

  const [{ data: product }, { data: steps }] = await Promise.all([
    db.from("products").select("id, name, model_no").eq("id", g.product_id).maybeSingle(),
    db.from("steps").select("*").eq("guide_id", g.id).order("position", { ascending: true }),
  ]);
  if (!product) return null;

  const languages = (Array.isArray(g.languages) ? g.languages : [])
    .filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));

  return {
    guide: {
      ...g,
      languages: languages.length ? languages : ["en"],
      meta: g.meta || {},
      parts: (g.parts as Part[]) || [],
    },
    product: { id: product.id, name: product.name || {}, model_no: product.model_no },
    steps: (steps as Step[]) || [],
  };
}

export async function getGuideAnalytics(guideId: string): Promise<GuideAnalytics> {
  const db = await createClient();
  if (!db) return { scans: 0, finished: 0, completionRate: 0, perStepViews: [] };

  const { count: scans } = await db
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guideId);

  const { count: finished } = await db
    .from("step_events")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guideId)
    .eq("action", "finished");

  const { data: views } = await db
    .from("step_events")
    .select("step_position")
    .eq("guide_id", guideId)
    .eq("action", "view");

  const byStep = new Map<number, number>();
  for (const v of (views as { step_position: number | null }[]) || []) {
    if (typeof v.step_position === "number") {
      byStep.set(v.step_position, (byStep.get(v.step_position) ?? 0) + 1);
    }
  }
  const perStepViews = [...byStep.entries()]
    .map(([position, count]) => ({ position, views: count }))
    .sort((a, b) => a.position - b.position);

  const s = scans ?? 0;
  const f = finished ?? 0;
  return {
    scans: s,
    finished: f,
    completionRate: s > 0 ? Math.round((f / s) * 100) : 0,
    perStepViews,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/slug";
import type { GuideMeta, LocalizedText, Part } from "@/lib/types";
import type { Locale } from "@/lib/locales";

export interface SaveStepInput {
  position: number;
  title: LocalizedText;
  body: LocalizedText;
  tip: LocalizedText;
  image_url: string | null;
}

export interface SaveGuideInput {
  productId: string;
  languages: Locale[];
  name: LocalizedText;
  model_no: string;
  meta: GuideMeta;
  parts: Part[];
  steps: SaveStepInput[];
}

type Result = { ok: boolean; message?: string };

/** Upsert a draft guide edit. RLS restricts every write to the owning seller. */
export async function saveGuide(guideId: string, input: SaveGuideInput): Promise<Result> {
  const db = await createClient();
  if (!db) return { ok: false, message: "Not configured." };

  // Confirm ownership by attempting to read the guide (RLS-scoped).
  const { data: guide } = await db.from("guides").select("id, product_id").eq("id", guideId).maybeSingle();
  if (!guide) return { ok: false, message: "Guide not found." };

  const { error: pErr } = await db
    .from("products")
    .update({
      name: input.name,
      model_no: input.model_no.trim() || null,
    })
    .eq("id", input.productId);
  if (pErr) return { ok: false, message: "Could not save product." };

  const { error: gErr } = await db
    .from("guides")
    .update({ languages: input.languages, meta: input.meta, parts: input.parts })
    .eq("id", guideId);
  if (gErr) return { ok: false, message: "Could not save guide." };

  // Replace steps wholesale to handle reorder/add/remove cleanly.
  await db.from("steps").delete().eq("guide_id", guideId);
  const rows = input.steps.map((s, i) => ({
    guide_id: guideId,
    position: i + 1,
    title: s.title,
    body: s.body,
    tip: s.tip,
    image_url: s.image_url,
  }));
  if (rows.length > 0) {
    const { error: sErr } = await db.from("steps").insert(rows);
    if (sErr) return { ok: false, message: "Could not save steps." };
  }

  revalidatePath(`/app/guide/${guideId}`);
  return { ok: true };
}

/** Publish: assign an immutable slug on first publish, set status + timestamp. */
export async function publishGuide(guideId: string): Promise<Result & { slug?: string }> {
  const db = await createClient();
  if (!db) return { ok: false, message: "Not configured." };

  const { data: guide } = await db
    .from("guides")
    .select("id, slug, status")
    .eq("id", guideId)
    .maybeSingle();
  if (!guide) return { ok: false, message: "Guide not found." };

  let slug = guide.slug as string | null;
  if (!slug) {
    // Retry a few times in the unlikely event of a slug collision.
    for (let attempt = 0; attempt < 5 && !slug; attempt++) {
      const candidate = generateSlug();
      const { error } = await db
        .from("guides")
        .update({ slug: candidate, status: "published", published_at: new Date().toISOString() })
        .eq("id", guideId);
      if (!error) slug = candidate;
      else if (error.code !== "23505") return { ok: false, message: "Could not publish." };
    }
    if (!slug) return { ok: false, message: "Could not assign a unique link." };
  } else {
    const { error } = await db
      .from("guides")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", guideId);
    if (error) return { ok: false, message: "Could not publish." };
  }

  revalidatePath(`/app/guide/${guideId}`);
  revalidatePath("/app");
  return { ok: true, slug };
}

export async function setGuideStatus(
  guideId: string,
  status: "draft" | "published" | "archived"
): Promise<Result> {
  const db = await createClient();
  if (!db) return { ok: false, message: "Not configured." };
  const { error } = await db.from("guides").update({ status }).eq("id", guideId);
  if (error) return { ok: false, message: "Could not update status." };
  revalidatePath(`/app/guide/${guideId}`);
  revalidatePath("/app");
  return { ok: true };
}

/** Update the seller's brand name (shown on published guides). */
export async function saveBrandName(brand: string): Promise<Result> {
  const db = await createClient();
  if (!db) return { ok: false, message: "Not configured." };
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { error } = await db
    .from("sellers")
    .upsert({ id: user.id, email: user.email ?? "", brand_name: brand.trim() || null }, { onConflict: "id" });
  if (error) return { ok: false, message: "Could not save brand." };
  return { ok: true };
}

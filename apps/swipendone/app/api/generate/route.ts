import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGuide } from "@/lib/generate";
import { extractManualText } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_LIMIT = 10; // generations per hour per seller (handoff §6)

export async function POST(req: Request) {
  // --- auth ---
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured." }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server storage not configured." },
      { status: 500 }
    );
  }

  // --- rate limit ---
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("generation_events")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit reached (10/hour). Try again shortly." },
      { status: 429 }
    );
  }

  // --- parse input ---
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const product_name = String(form.get("product_name") || "").trim();
  const model_no = String(form.get("model_no") || "").trim();
  const notes = String(form.get("notes") || "").trim();
  let image_urls: string[] = [];
  try {
    image_urls = JSON.parse(String(form.get("image_urls") || "[]"));
  } catch {
    image_urls = [];
  }
  if (!Array.isArray(image_urls)) image_urls = [];
  image_urls = image_urls.filter((u) => typeof u === "string").slice(0, 20);

  if (!product_name) {
    return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  }

  // optional manual file → extracted text
  let extracted_manual_text = "";
  const manual = form.get("manual");
  if (manual && manual instanceof File && manual.size > 0) {
    const buf = Buffer.from(await manual.arrayBuffer());
    extracted_manual_text = await extractManualText(buf, manual.name);
  }

  // --- generate ---
  let generated;
  try {
    generated = await generateGuide({
      product_name,
      model_no: model_no || undefined,
      notes: notes || undefined,
      extracted_manual_text: extracted_manual_text || undefined,
      image_urls,
    });
  } catch (e) {
    // Record the attempt even on failure so abuse still counts against the limit.
    await admin.from("generation_events").insert({ seller_id: user.id });
    const message =
      e instanceof Error && /ANTHROPIC_API_KEY/.test(e.message)
        ? "AI is not configured (missing API key)."
        : "Generation failed — try fewer images or simpler notes.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await admin.from("generation_events").insert({ seller_id: user.id });

  // --- persist draft (product + guide + steps) ---
  // Ensure a sellers row exists (the auth trigger normally creates it).
  await admin
    .from("sellers")
    .upsert({ id: user.id, email: user.email ?? "" }, { onConflict: "id" });

  const { data: product, error: pErr } = await admin
    .from("products")
    .insert({
      seller_id: user.id,
      name_en: product_name,
      name_zh: null,
      model_no: model_no || null,
    })
    .select("id")
    .single();
  if (pErr || !product) {
    return NextResponse.json({ error: "Could not save product." }, { status: 500 });
  }

  const { data: guide, error: gErr } = await admin
    .from("guides")
    .insert({
      product_id: product.id,
      status: "draft",
      meta_en: generated.meta_en,
      meta_zh: generated.meta_zh,
      parts: generated.parts,
    })
    .select("id")
    .single();
  if (gErr || !guide) {
    return NextResponse.json({ error: "Could not save guide." }, { status: 500 });
  }

  const stepRows = generated.steps.map((s, i) => {
    const idx = s.image_index;
    const image_url =
      typeof idx === "number" && idx >= 0 && idx < image_urls.length
        ? image_urls[idx]
        : null;
    return {
      guide_id: guide.id,
      position: i + 1,
      title_en: s.title_en,
      title_zh: s.title_zh,
      body_en: s.body_en,
      body_zh: s.body_zh,
      tip_en: s.tip_en,
      tip_zh: s.tip_zh,
      image_url,
    };
  });
  const { error: sErr } = await admin.from("steps").insert(stepRows);
  if (sErr) {
    return NextResponse.json({ error: "Could not save steps." }, { status: 500 });
  }

  return NextResponse.json({ guideId: guide.id });
}

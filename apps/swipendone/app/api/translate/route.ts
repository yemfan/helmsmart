import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateGuide, type TranslatableGuide } from "@/lib/generate";
import { isLocale, pick, type Locale } from "@/lib/locales";
import type { Guide, LocalizedText, Part, Step } from "@/lib/types";

export const runtime = "nodejs";
// One language at a time keeps each request well inside the limit.
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Auth not configured." }, { status: 500 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });

  let body: { guideId?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const guideId = String(body.guideId || "");
  const localeRaw = String(body.locale || "");
  if (!guideId || !isLocale(localeRaw)) {
    return NextResponse.json({ error: "Invalid guide or language." }, { status: 400 });
  }
  const locale = localeRaw as Locale;

  // Load the guide and confirm the caller owns it.
  const { data: guideRow } = await admin.from("guides").select("*").eq("id", guideId).maybeSingle();
  if (!guideRow) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  const guide = guideRow as Guide;

  const { data: product } = await admin
    .from("products")
    .select("id, name, seller_id")
    .eq("id", guide.product_id)
    .maybeSingle();
  if (!product || product.seller_id !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: stepRows } = await admin
    .from("steps")
    .select("*")
    .eq("guide_id", guideId)
    .order("position", { ascending: true });
  const steps = (stepRows as Step[]) || [];

  // Source language: the guide's first existing language.
  const existing = (Array.isArray(guide.languages) ? guide.languages : []).filter(isLocale);
  const base: Locale = existing[0] ?? "en";
  if (locale === base) return NextResponse.json({ ok: true, skipped: true });

  const parts = (guide.parts as Part[]) || [];
  const source: TranslatableGuide = {
    name: pick(product.name as LocalizedText, base),
    meta: {
      time_estimate: guide.meta?.[base]?.time_estimate ?? "",
      people: guide.meta?.[base]?.people ?? "",
      tools: guide.meta?.[base]?.tools ?? "",
    },
    parts: parts.map((p) => ({ code: p.code, name: pick(p.name, base) })),
    steps: steps.map((s) => ({
      title: pick(s.title, base),
      body: pick(s.body, base),
      tip: pick(s.tip, base),
    })),
  };

  let out: TranslatableGuide;
  try {
    out = await translateGuide(source, locale);
  } catch (e) {
    const message =
      e instanceof Error && /ANTHROPIC_API_KEY/.test(e.message)
        ? "AI is not configured (missing API key)."
        : "Translation failed — try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Merge the new locale into the existing locale-keyed maps.
  const nextName: LocalizedText = { ...(product.name as LocalizedText), [locale]: out.name };
  const nextMeta = { ...(guide.meta || {}), [locale]: out.meta };
  const nextParts = parts.map((p, i) => ({
    ...p,
    name: { ...p.name, [locale]: out.parts[i]?.name ?? "" },
  }));
  const nextLanguages = Array.from(new Set([...existing, locale]));

  const { error: pErr } = await admin.from("products").update({ name: nextName }).eq("id", product.id);
  const { error: gErr } = await admin
    .from("guides")
    .update({ meta: nextMeta, parts: nextParts, languages: nextLanguages })
    .eq("id", guideId);
  if (pErr || gErr) return NextResponse.json({ error: "Could not save translation." }, { status: 500 });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const t = out.steps[i];
    if (!t) continue;
    const { error: sErr } = await admin
      .from("steps")
      .update({
        title: { ...s.title, [locale]: t.title },
        body: { ...s.body, [locale]: t.body },
        tip: { ...s.tip, [locale]: t.tip },
      })
      .eq("id", s.id as string);
    if (sErr) return NextResponse.json({ error: "Could not save translated steps." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, locale });
}

/**
 * POST /api/sms/draft  { clientId, prompt }
 *
 * Drafts a short SMS for a client from a plain-English instruction, for the
 * HelmSmart AI panel. Claude (Haiku) + the client's preferred language (smbai
 * is bilingual-aware). Falls back to a simple template if no API key is set.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { replyLanguageRule, type Lang } from "@/lib/language";
import { getServerLocale } from "@/lib/i18n/server";
import { contactLanguageFor } from "@/lib/i18n/contactLocale";

export async function POST(request: NextRequest) {
  let clientId = "";
  let prompt = "";
  try {
    const json = await request.json();
    clientId = String(json.clientId ?? "").trim();
    prompt = String(json.prompt ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!clientId || !prompt) {
    return NextResponse.json({ ok: false, error: "Pick a contact and say what you want to text." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();
  const [{ data: client }, { data: org }] = await Promise.all([
    supabase
      .from("clients")
      .select("first_name, last_name, preferred_language")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.from("organizations").select("name, owner_english_assist").eq("id", orgId).single(),
  ]);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

  const firstName = client.first_name?.trim() || "";
  const orgName = org?.name?.trim() || "our business";
  const lang = (client.preferred_language as Lang | null) ?? "en";
  const assist = !!org?.owner_english_assist;
  const ownerLang = contactLanguageFor(await getServerLocale());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Graceful fallback so the panel still produces an editable starting point.
    return NextResponse.json({ ok: true, draft: `Hi${firstName ? " " + firstName : ""} — ${prompt}` });
  }

  const langRule = replyLanguageRule(lang, ownerLang, assist, "the message");

  const system = `You draft short, warm, professional SMS messages on behalf of the business "${orgName}". Keep it under 320 characters. ${langRule} Return ONLY the message text — no quotes, no labels, no subject line, no signature block.`;
  const userMsg = `Draft an SMS to ${firstName || "the customer"} that does this: ${prompt}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    let text = (resp.content[0] as { type: string; text?: string }).text ?? "";
    text = text.trim().replace(/^["']|["']$/g, "").trim();
    if (!text) throw new Error("Couldn't draft a message — try again.");
    return NextResponse.json({ ok: true, draft: text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Draft failed." },
      { status: 500 },
    );
  }
}

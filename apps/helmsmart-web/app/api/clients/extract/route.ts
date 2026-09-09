/**
 * POST /api/clients/extract
 *
 * Accepts a multipart form with `text` (pasted contacts / email signature / list)
 * and/or an `image` (business card, sign-in sheet). Uses Claude to extract a list
 * of contacts the owner can review before importing.
 *
 * Returns: { contacts: [{ first_name, last_name, company, email, phone, notes }] }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PROMPT = `Extract every distinct person/contact from the input — it may be free text, an email signature, a pasted list, a business card photo, or an open-house sign-in sheet.

For each contact, return: first_name, last_name, company, email, phone, notes (any extra context like title or how you met them; otherwise "").

Respond with ONLY a JSON array, no markdown or code fences:
[{"first_name":"","last_name":"","company":"","email":"","phone":"","notes":""}]

Use an empty string for unknown fields. If there are no contacts, return [].`;

export async function POST(request: NextRequest) {
  const t = await getServerT("clients");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: t("errors.aiNotConfigured") }, { status: 503 });
  }

  let text = "";
  let imageData: string | null = null;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";

  try {
    const form = await request.formData();
    text = ((form.get("text") as string) ?? "").trim();
    const file = form.get("image") as File | null;
    if (file && file.size > 0) {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(file.type)) {
        return NextResponse.json({ error: t("errors.extractUnsupportedImage") }, { status: 400 });
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: t("errors.extractImageTooLarge") }, { status: 400 });
      }
      imageData = Buffer.from(await file.arrayBuffer()).toString("base64");
      mediaType = (file.type === "image/jpg" ? "image/jpeg" : file.type) as typeof mediaType;
    }
    if (!text && !imageData) {
      return NextResponse.json({ error: t("errors.extractNoInput") }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: t("errors.extractReadFailed") }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const promptText = text ? `${PROMPT}\n\nInput:\n${text}` : PROMPT;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: imageData
            ? [
                { type: "image", source: { type: "base64", media_type: mediaType, data: imageData } },
                { type: "text", text: promptText },
              ]
            : promptText,
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text ?? "";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);

    let parsed: unknown;
    try {
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch {
      console.error("[clients/extract] JSON parse failed:", raw);
      return NextResponse.json({ error: t("errors.extractParseFailed") }, { status: 500 });
    }

    const arr = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    const contacts = arr
      .slice(0, 200)
      .map((c) => ({
        first_name: String(c.first_name ?? "").trim(),
        last_name: String(c.last_name ?? "").trim(),
        company: String(c.company ?? "").trim(),
        email: String(c.email ?? "").trim(),
        phone: String(c.phone ?? "").trim(),
        notes: String(c.notes ?? "").trim(),
      }))
      .filter((c) => c.first_name || c.company || c.email);

    return NextResponse.json({ contacts });
  } catch (err) {
    console.error("[clients/extract] Anthropic error:", err);
    return NextResponse.json({ error: t("errors.extractFailed") }, { status: 500 });
  }
}

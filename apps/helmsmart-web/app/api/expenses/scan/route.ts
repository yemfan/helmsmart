/**
 * POST /api/expenses/scan
 *
 * Accepts a multipart form with an `image` field (JPEG/PNG/WEBP receipt).
 * Uses Claude claude-opus-4-5 vision to extract:
 *   vendor_name, amount, date, description, category
 *
 * Returns JSON:
 *   { vendor_name, amount, date, description, category, confidence }
 *
 * No auth required beyond the Anthropic API key being present — this route
 * is only callable from within the authenticated dashboard (server-side fetch
 * or from a client within the session).
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { languageDirectiveForExtraction } from "@/lib/i18n/directives";

export const dynamic = "force-dynamic";

const PROMPT = `You are an expense receipt parser. Extract the following fields from this receipt image:

1. vendor_name — The business name (e.g. "Amazon", "Home Depot", "Starbucks")
2. amount — Total amount paid as a positive decimal number (e.g. 47.23). Do NOT include the currency symbol.
3. date — Date of the transaction in YYYY-MM-DD format. If the year is missing, assume the current year.
4. description — A short 3-10 word description of what was purchased (e.g. "Office supplies", "Team lunch", "Software subscription")
5. category — The best matching expense category from this list:
   Advertising & Marketing | Bank Fees | Computer & Software | Dues & Subscriptions |
   Equipment | Insurance | Meals & Entertainment | Office Supplies | Professional Services |
   Rent & Utilities | Repairs & Maintenance | Shipping & Delivery | Travel | Vehicle |
   Other

Respond with ONLY a JSON object in this exact format — no markdown, no code blocks:
{"vendor_name":"...","amount":0.00,"date":"YYYY-MM-DD","description":"...","category":"...","confidence":"high|medium|low"}

If you cannot read a field reliably, set it to null and use confidence "low".`;

export async function POST(request: NextRequest) {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: t("expenses.scan.notConfigured") }, { status: 503 });
  }

  let imageData: string;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: t("expenses.scan.noImage") }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: t("expenses.scan.unsupportedType") },
        { status: 400 }
      );
    }

    // 10 MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: t("expenses.scan.tooLarge") }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    imageData = Buffer.from(arrayBuffer).toString("base64");
    mediaType = (file.type === "image/jpg" ? "image/jpeg" : file.type) as typeof mediaType;
  } catch {
    return NextResponse.json({ error: t("expenses.scan.readFailed") }, { status: 400 });
  }

  /*
   * "description" is the only prose here — the form drops it straight into
   * the Description field the owner then reads and edits, so it comes back
   * in their language. Everything else is lifted off the receipt or chosen
   * from a fixed list: "category" is matched against CATEGORY_HINTS in
   * components/expense-form.tsx and "confidence" against three class names,
   * so a translated value there silently loses the match.
   */
  const directive = languageDirectiveForExtraction(locale, ["description"]);
  const prompt = directive
    ? `${PROMPT}${directive}
"category" and "confidence" are fixed enum values chosen from the lists above — return them in English, exactly as written there.`
    : PROMPT;

  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageData },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text ?? "";

    // Strip any accidental markdown wrapping
    const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();

    let parsed: {
      vendor_name: string | null;
      amount: number | null;
      date: string | null;
      description: string | null;
      category: string | null;
      confidence: string;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[scan-receipt] JSON parse failed:", rawText);
      return NextResponse.json({ error: t("expenses.scan.parseFailed") }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[scan-receipt] Anthropic error:", err);
    const msg = err instanceof Error ? err.message : t("expenses.scan.failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

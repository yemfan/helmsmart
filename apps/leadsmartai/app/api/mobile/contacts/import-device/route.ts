import { NextResponse } from "next/server";
import { z } from "zod";

import { runContactIngestion } from "@/lib/contact-intake/ingestionPipeline";
import { formatUsPhoneDigits } from "@/lib/contact-intake/phone";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Sequential per-contact dedup + insert; bounded by MAX_CONTACTS below.
export const maxDuration = 60;

/**
 * POST /api/mobile/contacts/import-device
 *
 * Bulk-import contacts the agent picked from their phone's address book
 * (expo-contacts on the mobile app). Each contact runs through the shared
 * ingestion pipeline (duplicate check → insert/merge/skip), so re-imports
 * and overlaps with the existing book don't create duplicates. Enrichment
 * is skipped for speed — these are bulk, agent-confirmed rows.
 *
 * Body: { contacts: [{ name?, email?, phone? }], duplicateStrategy? }
 * Default duplicateStrategy is "skip" (address books overlap heavily with
 * the CRM; never silently duplicate).
 */

const MAX_CONTACTS = 300;

const contactSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
});

const bodySchema = z.object({
  contacts: z.array(contactSchema).min(1).max(MAX_CONTACTS),
  duplicateStrategy: z.enum(["skip", "merge"]).optional(),
});

export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    const planType = String((agentRow as { plan_type?: string } | null)?.plan_type ?? "free").toLowerCase();
    if (planType === "free") {
      return NextResponse.json(
        { ok: false, success: false, error: "Importing contacts requires Pro. Upgrade to build your CRM." },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: `Send 1–${MAX_CONTACTS} contacts per request.`,
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const duplicateStrategy = parsed.data.duplicateStrategy ?? "skip";
    let inserted = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;

    for (const c of parsed.data.contacts) {
      const name = (c.name ?? "").trim();
      const email = (c.email ?? "").trim();
      const phoneRaw = (c.phone ?? "").trim();
      if (!name && !email && !phoneRaw) {
        errors += 1;
        continue;
      }
      const phone = (formatUsPhoneDigits(phoneRaw) ?? phoneRaw) || null;
      try {
        const result = await runContactIngestion({
          agentId: auth.ctx.agentId,
          planType,
          fields: {
            name: name || null,
            email: email || null,
            phone,
            source: "device_contacts",
          },
          intakeChannel: "device_contacts",
          duplicateStrategy,
          skipEnrichment: true,
        });
        if (result.action === "inserted") inserted += 1;
        else if (result.action === "merged") merged += 1;
        else skipped += 1;
      } catch (e) {
        // A per-contact failure (e.g. plan cap reached mid-batch) shouldn't
        // drop the whole import — count it and keep going.
        const msg = e instanceof Error ? e.message : "error";
        if (/upgrade|premium|limit/i.test(msg)) {
          // Quota hit — stop early; the rest would all fail the same way.
          return NextResponse.json(
            { ok: true, success: true, inserted, merged, skipped, errors, stoppedAt: msg },
            { status: 200 },
          );
        }
        errors += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      total: parsed.data.contacts.length,
      inserted,
      merged,
      skipped,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /upgrade|premium|not available/i.test(msg) ? 402 : 500;
    return NextResponse.json({ ok: false, success: false, error: msg }, { status });
  }
}

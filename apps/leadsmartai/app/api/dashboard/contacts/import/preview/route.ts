import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { previewImportJob } from "@/lib/contact-intake/importJobService";
import type { DuplicateStrategy } from "@/lib/contact-intake/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  jobId: z.string().uuid(),
  mapping: z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    property_address: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    lead_type: z.string().nullable().optional(),
    search_location: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    timeline: z.string().nullable().optional(),
    price_min: z.string().nullable().optional(),
    price_max: z.string().nullable().optional(),
    beds: z.string().nullable().optional(),
    baths: z.string().nullable().optional(),
    tags: z.string().nullable().optional(),
  }),
  duplicateStrategy: z.enum(["skip", "merge", "create_anyway"]),
});

export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { jobId, mapping, duplicateStrategy } = parsed.data;

    const result = await previewImportJob({
      agentId: auth.agentId,
      jobId,
      mapping,
      duplicateStrategy: duplicateStrategy as DuplicateStrategy,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

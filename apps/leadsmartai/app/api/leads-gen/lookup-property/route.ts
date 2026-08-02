import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { lookupProperty } from "@/lib/leads-gen/property-lookup";

export const runtime = "nodejs";
// The scrape fallback (render a listing page + read facts) can take a bit.
export const maxDuration = 120;

const bodySchema = z.object({
  /** Free-form input — raw address OR a listing URL
   *  (Zillow / Redfin / Realtor / Compass / MLS). */
  input: z.string().min(3).max(500),
});

/**
 * POST /api/leads-gen/lookup-property
 *
 * Powers the "Paste an address or URL" trigger in the Quick Post
 * wizard. Returns whatever structured property data we have from
 * properties_warehouse + the most recent snapshot, plus a pre-
 * stitched `brief` string the wizard drops into the textarea.
 *
 * Always returns 200 with a result — when we can't resolve the
 * input to a known property, `found: false` + a brief that just
 * carries the normalized address. The wizard then lets the agent
 * fill in any missing details manually.
 *
 * Plan gate: Pro+ (matches the rest of Quick Post).
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Generate Leads requires Pro or higher." },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await lookupProperty(parsed.data.input);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    console.error("[leads-gen/lookup-property]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpportunity, setOpportunityStatus } from "@/lib/opportunities";

export const runtime = "nodejs";

/** Accept or dismiss an opportunity. The human decides. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let status: unknown;
  try {
    ({ status } = (await req.json()) as { status?: unknown });
  } catch {
    /* fall through to validation */
  }
  if (status !== "accepted" && status !== "dismissed") {
    return NextResponse.json({ error: "status must be 'accepted' or 'dismissed'." }, { status: 400 });
  }

  const opp = await getOpportunity(user.id, id);
  if (!opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  try {
    await setOpportunityStatus(user.id, id, status);
    return NextResponse.json({ ok: true, opportunity: { ...opp, status } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}

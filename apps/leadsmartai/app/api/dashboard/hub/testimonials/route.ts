import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * /api/dashboard/hub/testimonials
 *
 * The agent's testimonials, for the hub's trust section. Rows arrive two
 * ways — the review-request flow writes them unpublished, and the agent can
 * add one they received elsewhere. Either way nothing shows publicly until
 * `is_published` is true, which only this route (the owner) can flip.
 *
 * Every write is scoped by agent id. A testimonial id alone is never enough.
 */

type Row = {
  id: string;
  rating: number | null;
  body: string;
  author_name: string | null;
  author_title: string | null;
  is_published: boolean;
  created_at: string;
};

async function list(agentId: string) {
  const { data, error } = await supabaseAdmin
    .from("testimonials")
    .select("id, rating, body, author_name, author_title, is_published, created_at")
    .eq("agent_id", agentId as never)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    authorName: r.author_name,
    authorTitle: r.author_title,
    published: r.is_published === true,
    createdAt: r.created_at,
  }));
}

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    return NextResponse.json({ ok: true, testimonials: await list(auth.agentId) });
  } catch (e) {
    console.error("[hub.testimonials] GET threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 1200) : "";
    if (!text) return NextResponse.json({ ok: false, error: "body_required" }, { status: 400 });
    const rating =
      typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5 ? Math.round(body.rating) : null;
    const { error } = await supabaseAdmin.from("testimonials").insert({
      agent_id: Number(auth.agentId),
      body: text,
      rating,
      author_name: typeof body.authorName === "string" ? body.authorName.trim().slice(0, 120) || null : null,
      author_title: typeof body.authorTitle === "string" ? body.authorTitle.trim().slice(0, 120) || null : null,
      is_published: body.published === true,
    } as never);
    if (error) {
      console.error("[hub.testimonials] insert:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, testimonials: await list(auth.agentId) });
  } catch (e) {
    console.error("[hub.testimonials] POST threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.published === "boolean") patch.is_published = body.published;
    if (typeof body.body === "string" && body.body.trim()) patch.body = body.body.trim().slice(0, 1200);
    if (typeof body.authorName === "string") patch.author_name = body.authorName.trim().slice(0, 120) || null;
    if (typeof body.authorTitle === "string") patch.author_title = body.authorTitle.trim().slice(0, 120) || null;
    if (body.rating === null) patch.rating = null;
    else if (typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5) patch.rating = Math.round(body.rating);
    const { error } = await supabaseAdmin
      .from("testimonials")
      .update(patch as never)
      .eq("id", id as never)
      .eq("agent_id", auth.agentId as never);
    if (error) {
      console.error("[hub.testimonials] update:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, testimonials: await list(auth.agentId) });
  } catch (e) {
    console.error("[hub.testimonials] PATCH threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    const { error } = await supabaseAdmin
      .from("testimonials")
      .delete()
      .eq("id", id as never)
      .eq("agent_id", auth.agentId as never);
    if (error) {
      console.error("[hub.testimonials] delete:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, testimonials: await list(auth.agentId) });
  } catch (e) {
    console.error("[hub.testimonials] DELETE threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

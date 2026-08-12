import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletePost, updatePost } from "@/lib/campaigns";

export const runtime = "nodejs";

/** Edit a draft post's copy. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  if (typeof body.title === "string") fields.title = body.title;
  if (typeof body.caption === "string") fields.caption = body.caption;
  if (typeof body.mediaPrompt === "string") fields.media_prompt = body.mediaPrompt;
  if (Array.isArray(body.hashtags)) fields.hashtags = body.hashtags.filter((h) => typeof h === "string");
  // Async approve: "approved" hands the post to the cron worker to generate +
  // publish shortly; "draft" pulls it back into the review queue; "skipped"
  // declines the recommendation — never publishes, kept in history.
  if (body.status === "approved" || body.status === "draft" || body.status === "skipped") fields.status = body.status;
  // Editing copy invalidates any previously-tailored per-platform captions.
  if ("caption" in fields || "title" in fields) fields.per_platform = null;
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    await updatePost(user.id, id, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  await deletePost(user.id, id).catch(() => {});
  return NextResponse.json({ ok: true });
}

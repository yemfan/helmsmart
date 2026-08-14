import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMetaPages, selectMetaPage } from "@/lib/metaPages";

export const runtime = "nodejs";

/** GET — the Facebook Pages this user granted, flagged with the connected one. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const pages = await listMetaPages(user.id);
    return NextResponse.json({ pages });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't load your Pages.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST { pageId } — switch which Page (and linked Instagram) we publish to. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { pageId?: string };
  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  if (!pageId) return NextResponse.json({ error: "Pick a Page first." }, { status: 400 });

  try {
    const out = await selectMetaPage(user.id, pageId);
    return NextResponse.json({
      ok: true,
      pageName: out.pageName,
      instagramUsername: out.instagramUsername,
      message: out.instagramUsername
        ? `Now posting to ${out.pageName} and @${out.instagramUsername}.`
        : `Now posting to ${out.pageName}. This Page has no linked Instagram business account, so Instagram was disconnected.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't switch Pages.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

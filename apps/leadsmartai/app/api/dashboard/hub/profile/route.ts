import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import {
  checkUsername,
  normalizeUsername,
  usernameProblemMessage,
} from "@/lib/identity/username";
import { isIndexable } from "@/lib/marketing-hub/feedItems";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET / PUT /api/dashboard/hub/profile
 *
 * Everything an agent needs to set up their marketing hub: their handle, the
 * words on it, and whether it is live.
 *
 * PUBLISHING IS A SEPARATE ACT FROM SAVING. An agent can write a bio, change
 * their mind, and leave the page — none of that should reach the public. The
 * hub goes live only when they flip the switch, and it cannot go live at all
 * without a handle, because there would be no URL to go live at.
 *
 * The username is checked here against the same rules the database enforces,
 * so a taken or reserved handle comes back as a sentence rather than a 23505.
 */

type Row = {
  username: string | null;
  bio: string | null;
  specialties: string[] | null;
  hub_published: boolean | null;
};

async function readRow(agentId: string) {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("username, bio, specialties, hub_published")
    .eq("id", agentId as never)
    .maybeSingle();
  return (data ?? {}) as Row;
}

/** How many published items the hub has — decides whether it can be indexed. */
async function postedCount(agentId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId as never)
    .eq("status", "posted");
  return count ?? 0;
}

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const [row, items] = await Promise.all([
      readRow(auth.agentId),
      postedCount(auth.agentId),
    ]);

    return NextResponse.json({
      ok: true,
      username: row.username ?? null,
      bio: row.bio ?? null,
      specialties: row.specialties ?? [],
      published: row.hub_published === true,
      postedItems: items,
      // The agent should know BEFORE publishing that a thin hub will not be
      // indexed — otherwise they publish, wait for traffic, and conclude the
      // product does not work.
      willBeIndexed: isIndexable({
        published: true,
        bio: row.bio,
        feedCount: items,
      }),
    });
  } catch (e) {
    console.error("[hub.profile] GET threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.username !== undefined) {
      const username = normalizeUsername(body.username as string);
      const problem = checkUsername(username);
      if (problem) {
        return NextResponse.json(
          { ok: false, field: "username", error: usernameProblemMessage(problem) },
          { status: 400 },
        );
      }
      // Taken by someone else? Answer in words. The unique index would raise
      // 23505, which is true but unreadable.
      const { data: clash } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      const clashId = (clash as { id: unknown } | null)?.id;
      if (clashId !== undefined && String(clashId) !== String(auth.agentId)) {
        return NextResponse.json(
          { ok: false, field: "username", error: "That username is taken." },
          { status: 409 },
        );
      }
      patch.username = username;
    }

    if (body.bio !== undefined) {
      patch.bio = String(body.bio ?? "").trim().slice(0, 2000) || null;
    }

    if (body.specialties !== undefined) {
      patch.specialties = Array.isArray(body.specialties)
        ? body.specialties
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .slice(0, 12)
        : [];
    }

    if (body.published !== undefined) {
      const wantPublished = body.published === true;
      if (wantPublished) {
        // A hub with no handle has no URL to be published at. Refuse with the
        // reason rather than storing a live flag that points nowhere.
        const current = await readRow(auth.agentId);
        const handle = (patch.username as string | undefined) ?? current.username;
        if (!handle) {
          return NextResponse.json(
            {
              ok: false,
              field: "username",
              error: "Choose a username first — that becomes your hub's address.",
            },
            { status: 400 },
          );
        }
      }
      patch.hub_published = wantPublished;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing_to_save" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("agents")
      .update(patch as never)
      .eq("id", auth.agentId as never);

    if (error) {
      console.error("[hub.profile] save failed:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    const [row, items] = await Promise.all([
      readRow(auth.agentId),
      postedCount(auth.agentId),
    ]);

    return NextResponse.json({
      ok: true,
      username: row.username ?? null,
      bio: row.bio ?? null,
      specialties: row.specialties ?? [],
      published: row.hub_published === true,
      postedItems: items,
      willBeIndexed: isIndexable({ published: true, bio: row.bio, feedCount: items }),
    });
  } catch (e) {
    console.error("[hub.profile] PUT threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

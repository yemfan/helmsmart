import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureTikTokAccessToken } from "@/lib/leads-gen/tiktok-publish";
import {
  brandedContentConflict,
  isPrivacyLevel,
  queryTikTokCreatorInfo,
  type TikTokPrivacyLevel,
} from "@/lib/leads-gen/tiktok-creator-info";

export const runtime = "nodejs";

/**
 * The creator's own TikTok posting choices.
 *
 * TikTok's Content Posting API requires that the account holder — not the app —
 * chooses the audience and declares commercial content. CloseBoss publishes from
 * a cron with nobody present, so the choice is made here once and replayed on
 * every automated post, with `creator_info` re-checked at publish time.
 *
 * GET returns what TikTok currently allows for this creator plus what they last
 * chose. PUT records a choice, refusing anything TikTok would reject.
 */

const CONN_COLS =
  "id, platform, status, tiktok_open_id, tiktok_username, user_access_token_enc, tiktok_refresh_token_enc, user_token_expires_at, tiktok_privacy_level, tiktok_disable_comment, tiktok_disable_duet, tiktok_disable_stitch, tiktok_brand_organic, tiktok_brand_content, tiktok_prefs_confirmed_at, tiktok_creator_nickname";

type ConnRow = {
  id: string;
  tiktok_username: string | null;
  user_access_token_enc: string | null;
  tiktok_refresh_token_enc: string | null;
  user_token_expires_at: string | null;
  tiktok_privacy_level: string | null;
  tiktok_disable_comment: boolean | null;
  tiktok_disable_duet: boolean | null;
  tiktok_disable_stitch: boolean | null;
  tiktok_brand_organic: boolean | null;
  tiktok_brand_content: boolean | null;
  tiktok_prefs_confirmed_at: string | null;
  tiktok_creator_nickname: string | null;
};

async function loadConnection(agentId: string): Promise<ConnRow | null> {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select(CONN_COLS)
    .eq("agent_id", agentId as never)
    .eq("platform", "tiktok" as never)
    .neq("status", "revoked" as never)
    .limit(1)
    .maybeSingle();
  return (data as ConnRow | null) ?? null;
}

function storedPrefs(conn: ConnRow) {
  return {
    privacyLevel: conn.tiktok_privacy_level,
    disableComment: conn.tiktok_disable_comment === true,
    disableDuet: conn.tiktok_disable_duet === true,
    disableStitch: conn.tiktok_disable_stitch === true,
    brandOrganic: conn.tiktok_brand_organic === true,
    brandContent: conn.tiktok_brand_content === true,
    confirmedAt: conn.tiktok_prefs_confirmed_at,
    nickname: conn.tiktok_creator_nickname ?? conn.tiktok_username,
  };
}

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const conn = await loadConnection(auth.agentId);
    if (!conn) return NextResponse.json({ ok: true, connected: false });

    // Ask TikTok what this creator may choose. A failure here is reported
    // rather than guessed around — showing a privacy option TikTok will reject
    // is worse than showing none.
    let creatorInfo = null;
    let creatorInfoError: string | null = null;
    try {
      const token = await ensureTikTokAccessToken(conn);
      creatorInfo = await queryTikTokCreatorInfo(token);
    } catch (e) {
      creatorInfoError = e instanceof Error ? e.message : "Could not reach TikTok.";
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      username: conn.tiktok_username,
      prefs: storedPrefs(conn),
      creatorInfo,
      creatorInfoError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const conn = await loadConnection(auth.agentId);
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: "Connect a TikTok account first." },
        { status: 409 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const privacyLevel = body.privacyLevel;
    if (!isPrivacyLevel(privacyLevel)) {
      return NextResponse.json(
        { ok: false, error: "Choose who can see these posts." },
        { status: 400 },
      );
    }

    // The chosen level has to be one TikTok currently offers this creator.
    // Trusting the browser here is how you end up posting to an audience the
    // account does not allow, which TikTok rejects at publish time.
    const token = await ensureTikTokAccessToken(conn);
    const info = await queryTikTokCreatorInfo(token);
    if (!info.privacyLevelOptions.includes(privacyLevel as TikTokPrivacyLevel)) {
      return NextResponse.json(
        { ok: false, error: "TikTok does not offer that audience for this account." },
        { status: 400 },
      );
    }

    const brandContent = body.brandContent === true;
    const conflict = brandedContentConflict({ privacyLevel, brandContent });
    if (conflict) return NextResponse.json({ ok: false, error: conflict }, { status: 400 });

    // Account-level switches win: if the creator has comments off on TikTok, it
    // stays off here regardless of what the form sent.
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        tiktok_privacy_level: privacyLevel,
        tiktok_disable_comment: body.disableComment === true || info.commentDisabled,
        tiktok_disable_duet: body.disableDuet === true || info.duetDisabled,
        tiktok_disable_stitch: body.disableStitch === true || info.stitchDisabled,
        tiktok_brand_organic: body.brandOrganic === true,
        tiktok_brand_content: brandContent,
        tiktok_creator_nickname: info.nickname,
        tiktok_prefs_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", conn.id as never);
    if (error) throw new Error(error.message);

    const saved = await loadConnection(auth.agentId);
    return NextResponse.json({
      ok: true,
      prefs: saved ? storedPrefs(saved) : null,
      creatorInfo: info,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("PUT /api/leads-gen/connect/tiktok/post-options:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

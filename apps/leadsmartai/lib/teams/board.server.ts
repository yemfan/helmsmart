import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { orderPosts, type BoardInput, type BoardPost, type BoardReply } from "./board";

/**
 * The office board: read for a viewer, post, reply, like, take down. One
 * query per table for the whole board (posts, replies, likes), folded in
 * memory. The board keeps the newest 300 posts; an office that outgrows
 * that has a forum on its hands, not a board.
 */

type PostRow = { id: string; kind: BoardPost["kind"]; title: string; body: string | null; link_url: string | null; price: number | string | null; author_agent_id: unknown; created_at: string };
type ReplyRow = { id: string; post_id: string; author_agent_id: unknown; body: string; created_at: string };

const COLS = "id, kind, title, body, link_url, price, author_agent_id, created_at";
const BOARD_LIMIT = 300;

function toPost(r: PostRow): BoardPost {
  return { id: r.id, kind: r.kind, title: r.title, body: r.body, linkUrl: r.link_url, price: r.price == null ? null : Number(r.price), authorAgentId: String(r.author_agent_id), createdAt: r.created_at, likes: 0, likedByMe: false, replies: [] };
}

export async function listBoard(teamId: string, viewerAgentId: string): Promise<BoardPost[]> {
  try {
    const { data } = await supabaseAdmin.from("team_board_posts").select(COLS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(BOARD_LIMIT);
    const posts = ((data as PostRow[] | null) ?? []).map(toPost);
    if (!posts.length) return [];
    const ids = posts.map((p) => p.id);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const [{ data: replies }, { data: likes }] = await Promise.all([
      supabaseAdmin.from("team_board_replies").select("id, post_id, author_agent_id, body, created_at").in("post_id", ids).order("created_at", { ascending: true }).limit(20_000),
      supabaseAdmin.from("team_board_likes").select("post_id, agent_id").in("post_id", ids).limit(200_000),
    ]);
    for (const r of (replies as ReplyRow[] | null) ?? []) byId.get(r.post_id)?.replies.push({ id: r.id, authorAgentId: String(r.author_agent_id), body: r.body, createdAt: r.created_at } satisfies BoardReply);
    for (const l of (likes as { post_id: string; agent_id: unknown }[] | null) ?? []) {
      const p = byId.get(l.post_id);
      if (!p) continue;
      p.likes += 1;
      if (String(l.agent_id) === viewerAgentId) p.likedByMe = true;
    }
    return orderPosts(posts);
  } catch (e) {
    console.warn("[teams.board] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function createBoardPost(teamId: string, authorAgentId: string, input: BoardInput): Promise<BoardPost> {
  const { data, error } = await supabaseAdmin
    .from("team_board_posts")
    .insert({ team_id: teamId, author_agent_id: authorAgentId, kind: input.kind, title: input.title, body: input.body, link_url: input.linkUrl, price: input.price } as never)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return toPost(data as PostRow);
}

/** The author or a manager may take a post down. */
export async function removeBoardPost(teamId: string, id: string, by: { agentId: string; canManage: boolean }): Promise<boolean> {
  let q = supabaseAdmin.from("team_board_posts").delete().eq("team_id", teamId).eq("id", id);
  if (!by.canManage) q = q.eq("author_agent_id", by.agentId as never);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

export async function addReply(teamId: string, postId: string, authorAgentId: string, body: string): Promise<BoardReply> {
  const { data: post } = await supabaseAdmin.from("team_board_posts").select("id").eq("team_id", teamId).eq("id", postId).maybeSingle();
  if (!post) throw new Error("not_found");
  const { data, error } = await supabaseAdmin.from("team_board_replies").insert({ post_id: postId, author_agent_id: authorAgentId, body } as never).select("id, post_id, author_agent_id, body, created_at").single();
  if (error) throw new Error(error.message);
  const r = data as ReplyRow;
  return { id: r.id, authorAgentId: String(r.author_agent_id), body: r.body, createdAt: r.created_at };
}

export async function removeReply(teamId: string, replyId: string, by: { agentId: string; canManage: boolean }): Promise<boolean> {
  const { data: reply } = await supabaseAdmin.from("team_board_replies").select("id, author_agent_id, team_board_posts!inner(team_id)").eq("id", replyId).maybeSingle();
  const row = reply as { author_agent_id: unknown; team_board_posts: { team_id: string } | { team_id: string }[] } | null;
  if (!row) return false;
  const teamOf = Array.isArray(row.team_board_posts) ? row.team_board_posts[0]?.team_id : row.team_board_posts?.team_id;
  if (teamOf !== teamId) return false;
  if (!by.canManage && String(row.author_agent_id) !== by.agentId) return false;
  const { error } = await supabaseAdmin.from("team_board_replies").delete().eq("id", replyId);
  if (error) throw new Error(error.message);
  return true;
}

export async function setLike(postId: string, agentId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabaseAdmin.from("team_board_likes").upsert({ post_id: postId, agent_id: agentId } as never, { onConflict: "post_id,agent_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("team_board_likes").delete().eq("post_id", postId).eq("agent_id", agentId as never);
    if (error) throw new Error(error.message);
  }
}

import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { addMemory, archiveMemory, listMemories } from "@/lib/boss/memory/store";
import { isMemoryKind } from "@/lib/boss/memory/pure";

export const runtime = "nodejs";

/**
 * /api/dashboard/boss/memories — the realtor's view of Max's notebook.
 *   GET            → { ok, notes: [...] } (active, newest first)
 *   POST {content, kind?} → { ok, note } | { ok:false, error }
 *   DELETE ?id=    → { ok } (archives; the row stays for audit)
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    if (!agentId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const notes = await listMemories(agentId);
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    console.error("[boss/memories GET]", e);
    return NextResponse.json({ ok: false, error: "Couldn't load notes." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    if (!agentId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { content?: unknown; kind?: unknown };
    const content = typeof body.content === "string" ? body.content : "";
    const r = await addMemory({
      agentId,
      content,
      kind: isMemoryKind(body.kind) ? body.kind : "fact",
      source: "agent",
    });
    if (r.status === "empty") return NextResponse.json({ ok: false, error: "Write the note first." }, { status: 400 });
    if (r.status === "duplicate") return NextResponse.json({ ok: false, error: "Max already has that note." }, { status: 409 });
    return NextResponse.json({ ok: true, note: r.note });
  } catch (e) {
    console.error("[boss/memories POST]", e);
    return NextResponse.json({ ok: false, error: "Couldn't add that note." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    if (!agentId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const ok = await archiveMemory(agentId, id);
    if (!ok) return NextResponse.json({ ok: false, error: "That note is already gone." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[boss/memories DELETE]", e);
    return NextResponse.json({ ok: false, error: "Couldn't remove that note." }, { status: 500 });
  }
}

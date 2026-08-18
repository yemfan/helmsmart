import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureAssistantsForAgent, updateAssistantForAgent } from "@/lib/closeboss/assistants";
import { AI_TEAM, type AssistantType } from "@/lib/closeboss/team";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/closeboss/assistant-avatar  (multipart/form-data)
 *   fields: type=<assistant type>, file=<image>
 * Uploads a custom avatar photo to the `avatars` storage bucket (service-role,
 * so no client storage RLS), saves its public URL on the assistant, and returns
 * the updated row. A custom photo overrides the built-in persona avatar.
 *
 * DELETE — body { type } — removes the custom photo (reverts to the persona).
 */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Expected a multipart upload." }, { status: 400 });
    }

    const type = AI_TEAM.find((d) => d.type === form.get("type"))?.type as AssistantType | undefined;
    if (!type) {
      return NextResponse.json({ ok: false, error: "Unknown assistant type." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "No image provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Image must be 5 MB or smaller." }, { status: 400 });
    }
    const contentType = file.type || "image/png";
    if (!ALLOWED.has(contentType)) {
      return NextResponse.json(
        { ok: false, error: "Use a JPG, PNG, WEBP, or GIF image." },
        { status: 400 },
      );
    }

    const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
    const path = `assistants/${agentId}/${type}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      console.error("[assistant-avatar] upload failed:", upErr.message);
      return NextResponse.json({ ok: false, error: "Upload failed. Try again." }, { status: 500 });
    }

    const { data: pub } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = pub?.publicUrl;
    if (!avatarUrl) {
      return NextResponse.json({ ok: false, error: "Could not resolve image URL." }, { status: 500 });
    }

    await ensureAssistantsForAgent(agentId);
    const assistant = await updateAssistantForAgent(agentId, type, { avatarUrl });
    return NextResponse.json({ ok: true, assistant });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/closeboss/assistant-avatar:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as { type?: string };
    const type = AI_TEAM.find((d) => d.type === body.type)?.type as AssistantType | undefined;
    if (!type) {
      return NextResponse.json({ ok: false, error: "Unknown assistant type." }, { status: 400 });
    }
    await ensureAssistantsForAgent(agentId);
    const assistant = await updateAssistantForAgent(agentId, type, { avatarUrl: null });
    return NextResponse.json({ ok: true, assistant });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("DELETE /api/dashboard/closeboss/assistant-avatar:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

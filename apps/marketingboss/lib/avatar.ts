import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCharacter, recordCharacterUsage } from "@/lib/characters";
import { MAX_SCRIPT_CHARS, speak } from "@/lib/voiceover";

/**
 * A character speaking — the visible half of a digital twin.
 *
 * The portrait already anchors that character's identity, and the voice may
 * already be a clone of the owner's. This joins them, so the person whose
 * business it is can appear and speak without filming anything.
 *
 * Verified against the live model on 2026-08-20: veed/fabric-1.0 turned a real
 * head-and-shoulders photo plus an mp3 into a 720p talking clip in 47s, audio
 * track present, face, hair and wardrobe intact. Worth recording because
 * Seedance 2.5 REFUSES a face reference outright — Fabric does not, which is
 * what makes a twin possible here at all.
 */

const FABRIC_MODEL = "veed/fabric-1.0";
const QUEUE = "https://queue.fal.run";

/** A real video render, but driven from one still rather than a whole scene. */
export const AVATAR_CREDIT = 15;

export class AvatarCreditError extends Error {
  constructor() {
    super(`Not enough credits — a talking video costs ${AVATAR_CREDIT}.`);
    this.name = "AvatarCreditError";
  }
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Drive a portrait with an audio track into a lip-synced clip. */
async function fabric(imageUrl: string, audioUrl: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${QUEUE}/${FABRIC_MODEL}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, resolution: "720p" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!sub.ok) throw new Error(`Avatar render rejected (${sub.status}).`);

  const statusUrl = q.status_url || `${QUEUE}/${FABRIC_MODEL}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${QUEUE}/${FABRIC_MODEL}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const s = (await (await fetch(statusUrl, { headers: H })).json().catch(() => ({}))) as {
      status?: string;
    };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("The avatar render failed.");
    // 47s measured for a short line; the ceiling is headroom for a long script,
    // and sits under the route's maxDuration so the refund still runs.
    if (Date.now() - started > 480_000) throw new Error("Avatar render timed out.");
    await new Promise((r) => setTimeout(r, 3000));
  }
  const out = (await (await fetch(responseUrl, { headers: H })).json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  // A COMPLETED job can still carry a validation error instead of a result.
  if (out.detail) throw new Error("The avatar render was rejected.");
  const url =
    (out.video as { url?: string } | undefined)?.url ||
    (typeof out.video_url === "string" ? out.video_url : undefined);
  if (!url) throw new Error("The avatar render returned no video.");
  return url;
}

/**
 * Drive a portrait with a spoken script and store the finished clip.
 *
 * The shared core behind both render paths — a Character from Character Studio,
 * and the user's own digital twin. Extracted rather than copied so the credit
 * reserve/refund and the storage write cannot drift apart between them: a
 * refund that exists on one path and not the other is exactly the bug that
 * charges someone for a video they never received.
 */
export async function renderTalkingVideo(
  supabase: SupabaseClient,
  userId: string,
  opts: { portraitUrl: string; script: string; voiceId?: string; label: string },
): Promise<{ url: string; credits: number }> {
  const { data: remaining, error: reserveErr } = await supabase.rpc("consume_credits", {
    p_cost: AVATAR_CREDIT,
  });
  if (reserveErr) throw new Error("Could not check credits.");
  if (typeof remaining === "number" && remaining < 0) throw new AvatarCreditError();

  try {
    // Same TTS step the voiceover uses, so a cloned voice works here too and
    // the two cannot drift apart on engine or voice selection.
    const audioUrl = await speak(
      supabase,
      userId,
      opts.script.slice(0, MAX_SCRIPT_CHARS),
      opts.voiceId ?? "",
    );
    const rendered = await fabric(opts.portraitUrl, audioUrl);

    const media = await fetch(rendered);
    if (!media.ok) throw new Error(`Could not fetch the finished video (${media.status}).`);
    const bytes = new Uint8Array(await media.arrayBuffer());
    const path = `${userId}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
    const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

    await supabase.from("generations").insert({
      user_id: userId,
      type: "video",
      prompt: `${opts.label}: ${opts.script.slice(0, 160)}`,
      model: FABRIC_MODEL,
      aspect: "1:1",
      media_url: publicUrl,
    });

    return { url: publicUrl, credits: typeof remaining === "number" ? remaining : 0 };
  } catch (e) {
    await supabase.rpc("consume_credits", { p_cost: -AVATAR_CREDIT }); // best-effort refund
    throw e;
  }
}

/** Make `characterId` say `script`, and store the result. */
export async function buildTalkingAvatar(
  supabase: SupabaseClient,
  userId: string,
  characterId: string,
  script: string,
  voiceId = "",
): Promise<{ url: string; credits: number }> {
  const character = await getCharacter(userId, characterId);
  if (!character) throw new Error("That character was not found.");
  const portraitUrl = (character.reference_images ?? []).find((u) => typeof u === "string" && u);
  if (!portraitUrl) {
    throw new Error(`${character.name} has no picture yet — add one in Character Studio first.`);
  }

  const out = await renderTalkingVideo(supabase, userId, {
    portraitUrl,
    script,
    voiceId,
    label: `${character.name} says`,
  });
  void recordCharacterUsage(userId, characterId);
  return out;
}

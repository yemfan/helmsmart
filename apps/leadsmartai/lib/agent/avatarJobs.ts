import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { deductCredits, refundCredits, CREDIT_COSTS } from "@/lib/credits/ledger";
import { meteringEnforced } from "@/lib/credits/metering";
import { insertAgentInboxNotification } from "@/lib/notifications/agentNotifications";
import {
  submitAvatarRender,
  submitAvatarUpscale,
  pollFalOnce,
  finalizeAvatarRender,
} from "@/lib/agent/avatarStudio";

/**
 * Avatar renders as background jobs.
 *
 * The point is NOT merely "run it later" — a cron handler is a 300s serverless
 * function too, so moving the same blocking render into one would hit the same
 * wall. The point is that no invocation ever WAITS: a tick either submits to
 * fal, or checks a submitted request once and returns. A render can therefore
 * outlive any single function, and the credit refund runs in normal code rather
 * than being skipped by a SIGKILL.
 *
 * State machine (one transition per tick):
 *   queued    --submit base-->     rendering
 *   rendering --poll: done-->      upscaling (if Sharper) | done
 *   upscaling --poll: done-->      done
 *   upscaling --poll: failed-->    done, using the base clip
 *   any       --too old / error--> failed (+ refund)
 */

const TABLE = "avatar_render_jobs";

/**
 * A job in flight longer than this is written off and refunded. fal renders run
 * minutes, not half-hours; past this it is stuck, and an agent waiting forever
 * on a job that silently died is worse than a refund and an honest failure.
 */
const STUCK_AFTER_MS = 30 * 60 * 1000;

/** Transient fal/network blips shouldn't kill a paid render on the first stumble. */
const MAX_ATTEMPTS = 5;

export type AvatarJobStatus = "queued" | "rendering" | "upscaling" | "done" | "failed";

export type AvatarJob = {
  id: string;
  agent_id: number;
  user_id: string;
  script: string;
  voice: string | null;
  audio_path: string | null;
  sharpen: boolean;
  photo_avatar: boolean;
  status: AvatarJobStatus;
  fal_request_id: string | null;
  fal_status_url: string | null;
  fal_response_url: string | null;
  base_video_url: string | null;
  video_url: string | null;
  error: string | null;
  credits: number;
  attempts: number;
  created_at: string;
  updated_at: string;
};

async function patch(id: string, values: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from(TABLE)
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** The agent's most recent job — what the studio polls to show progress. */
export async function getLatestAvatarJob(agentId: string): Promise<AvatarJob | null> {
  const { data } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId as unknown as number)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AvatarJob | null) ?? null;
}

/**
 * Reserve credits and queue the render. Returns immediately — the agent gets a
 * job id, not a video.
 *
 * Credits are taken HERE rather than on completion so an agent can't queue ten
 * renders they can't pay for; every failure path below refunds.
 */
export async function enqueueAvatarRender(input: {
  agentId: string;
  userId: string;
  script: string;
  voice?: string | null;
  audioPath?: string | null;
  sharpen?: boolean;
  photoAvatar?: boolean;
}): Promise<AvatarJob> {
  const script = input.script.trim();
  if (!script) throw new Error("Nothing to say — draft or write a script first.");

  // One render at a time per agent: a second queued job would spend credits on
  // work whose result the studio can't show anyway (it displays the latest).
  const latest = await getLatestAvatarJob(input.agentId);
  if (latest && (latest.status === "queued" || latest.status === "rendering" || latest.status === "upscaling")) {
    throw new Error("A video is already rendering — we'll let you know the moment it's ready.");
  }

  const cost = meteringEnforced() ? CREDIT_COSTS.twinAvatar : 0;
  if (cost > 0) await deductCredits(input.userId, cost, "twin"); // throws InsufficientCreditsError

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      agent_id: input.agentId as unknown as number,
      user_id: input.userId,
      script: script.slice(0, 4000),
      voice: input.voice ?? null,
      audio_path: input.audioPath ?? null,
      sharpen: Boolean(input.sharpen),
      photo_avatar: Boolean(input.photoAvatar),
      status: "queued",
      credits: cost,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Never hold credits for a job that doesn't exist.
    if (cost > 0) await refundCredits(input.userId, cost, "twin").catch(() => {});
    throw new Error("Could not queue the render. Try again in a moment.");
  }
  return data as AvatarJob;
}

async function failJob(job: AvatarJob, message: string): Promise<void> {
  if (job.credits > 0) await refundCredits(job.user_id, job.credits, "twin").catch(() => {});
  await patch(job.id, { status: "failed", error: message.slice(0, 500) });
  await notify(job, false, message).catch(() => {});
}

/**
 * Tell the agent. Best-effort and recorded separately from `status`, so a
 * notification outage can never make a finished render look unfinished.
 */
async function notify(job: AvatarJob, ok: boolean, detail?: string): Promise<void> {
  await insertAgentInboxNotification({
    agentId: String(job.agent_id),
    type: "avatar_ready",
    priority: ok ? "medium" : "high",
    title: ok ? "Your avatar video is ready" : "Your avatar video didn't finish",
    body: ok
      ? "The talking-head video you queued has finished rendering — open the Digital Twin to watch and post it."
      : `${detail ?? "The render failed."} Your credits were returned.`,
    // Reuses the `home` slot: the mobile handler routes by notification kind,
    // so this needs no new MobileNotificationDeepScreen value.
    deepLink: { screen: "home" },
  });
  await patch(job.id, { notified_at: new Date().toISOString() });
}

/** Store the finished clip and close the job out. */
async function finish(job: AvatarJob, falVideoUrl: string): Promise<void> {
  const { videoUrl } = await finalizeAvatarRender(String(job.agent_id), job.script, falVideoUrl);
  await patch(job.id, { status: "done", video_url: videoUrl, error: null });
  await notify({ ...job, video_url: videoUrl }, true).catch((e) => {
    console.warn(`[avatar-jobs] notify failed for ${job.id}:`, e instanceof Error ? e.message : e);
  });
}

/** Exactly ONE state transition. Never blocks on fal. */
async function advanceOne(job: AvatarJob): Promise<void> {
  if (Date.now() - new Date(job.updated_at).getTime() > STUCK_AFTER_MS) {
    await failJob(job, "The render didn't come back in time, so we stopped waiting.");
    return;
  }

  try {
    if (job.status === "queued") {
      const handle = await submitAvatarRender(String(job.agent_id), job.script, job.audio_path, {
        photoAvatar: job.photo_avatar,
        voice: job.voice,
      });
      await patch(job.id, {
        status: "rendering",
        fal_request_id: handle.requestId,
        fal_status_url: handle.statusUrl,
        fal_response_url: handle.responseUrl,
      });
      return;
    }

    if (!job.fal_status_url || !job.fal_response_url) {
      await failJob(job, "The render lost track of its provider request.");
      return;
    }
    const poll = await pollFalOnce({ statusUrl: job.fal_status_url, responseUrl: job.fal_response_url });

    if (poll.state === "running") {
      await patch(job.id, {}); // touch updated_at so the stuck-check measures progress
      return;
    }

    if (job.status === "rendering") {
      if (poll.state === "failed" || !poll.videoUrl) {
        await failJob(job, "The video provider couldn't render this clip.");
        return;
      }
      if (job.sharpen) {
        // Keep the base clip: if the Sharper pass fails we still owe the agent
        // the video they paid for, not an error.
        const up = await submitAvatarUpscale(poll.videoUrl);
        await patch(job.id, {
          status: "upscaling",
          base_video_url: poll.videoUrl,
          fal_request_id: up.requestId,
          fal_status_url: up.statusUrl,
          fal_response_url: up.responseUrl,
        });
        return;
      }
      await finish(job, poll.videoUrl);
      return;
    }

    if (job.status === "upscaling") {
      const chosen = poll.state === "done" && poll.videoUrl ? poll.videoUrl : job.base_video_url;
      if (!chosen) {
        await failJob(job, "The video provider couldn't render this clip.");
        return;
      }
      if (poll.state !== "done") {
        console.warn(`[avatar-jobs] upscale failed for ${job.id}; delivering the base clip`);
      }
      await finish(job, chosen);
    }
  } catch (e) {
    const attempts = job.attempts + 1;
    const message = e instanceof Error ? e.message : "The render failed.";
    if (attempts >= MAX_ATTEMPTS) {
      await failJob({ ...job, attempts }, message);
      return;
    }
    // Leave the status alone and try again next tick — most failures here are
    // transient storage/network blips, not bad input.
    console.warn(`[avatar-jobs] ${job.id} attempt ${attempts}: ${message}`);
    await patch(job.id, { attempts, error: message.slice(0, 500) });
  }
}

/** Drain entry point — called by the cron. */
export async function advanceAvatarRenderJobs(limit = 10): Promise<{ scanned: number }> {
  const { data } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .in("status", ["queued", "rendering", "upscaling"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  const jobs = (data as AvatarJob[] | null) ?? [];
  for (const job of jobs) {
    await advanceOne(job).catch((e) => {
      console.error(`[avatar-jobs] ${job.id} advance threw:`, e instanceof Error ? e.message : e);
    });
  }
  return { scanned: jobs.length };
}

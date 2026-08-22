import "server-only";

/**
 * Submit a job to fal's queue API and wait for its result.
 *
 * fal's queue is submit -> poll -> fetch, and every caller here has to handle
 * the same three traps: a non-2xx submit whose body holds the real reason, a
 * COMPLETED job that still carries a `detail` validation error instead of a
 * result, and a poll ceiling that must sit under the calling route's
 * maxDuration so a refund still runs instead of being cut off by a SIGKILL.
 *
 * NOTE: lib/fal.ts, lib/avatar.ts, lib/ctaVideo.ts and lib/transcribeMedia.ts
 * each still carry their own copy of this loop with their own timeouts and
 * error strings. They predate this module; new callers should use it.
 */

const QUEUE = "https://queue.fal.run";

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

export async function falRun(
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<Record<string, unknown>> {
  const label = opts.label || model;
  const timeoutMs = opts.timeoutMs ?? 260_000;
  const H = falHeaders();

  const sub = await fetch(`${QUEUE}/${model}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(input),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!sub.ok) {
    const detail = typeof q.detail === "string" ? `: ${q.detail}` : "";
    throw new Error(`${label} was rejected (${sub.status})${detail}`);
  }

  const statusUrl = q.status_url || `${QUEUE}/${model}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${QUEUE}/${model}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const s = (await (await fetch(statusUrl, { headers: H })).json().catch(() => ({}))) as {
      status?: string;
    };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`${label} failed.`);
    if (Date.now() - started > timeoutMs) throw new Error(`${label} timed out.`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  const res = await fetch(responseUrl, { headers: H });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${label} returned ${res.status}.`);
  if (out.detail) throw new Error(`${label} was rejected.`);
  return out;
}

/** Pull the video URL out of a fal result, whichever shape it used. */
export function videoUrlFrom(out: Record<string, unknown>): string | null {
  const direct = (out.video as { url?: string } | undefined)?.url;
  if (direct) return direct;
  if (typeof out.video_url === "string") return out.video_url;
  const first = (out.videos as { url?: string }[] | undefined)?.[0]?.url;
  return first || null;
}

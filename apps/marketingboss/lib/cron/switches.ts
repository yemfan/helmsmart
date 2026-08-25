import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * On/off switches for the scheduled jobs, read fresh at the top of each tick.
 *
 * The jobs are declared in vercel.json, so stopping one used to mean a commit
 * and a deploy — or clearing CRON_SECRET, which stops both. This is the smaller
 * lever: one row per job, flipped from the admin page, effective on the next
 * tick with no build in between.
 */

export const CRON_JOBS = {
  cron_run: {
    label: "Main pipeline",
    path: "/api/cron/run",
    schedule: "every 15 minutes",
  },
  cron_missions: {
    label: "Mission continuation",
    path: "/api/cron/missions",
    schedule: "every 5 minutes",
  },
} as const;

export type CronJob = keyof typeof CRON_JOBS;

export type CronSwitch = {
  job: CronJob;
  enabled: boolean;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

/**
 * Is this job allowed to run?
 *
 * Fails OPEN. A missing table (migration not applied yet) or a database blip
 * must not silently stop every scheduled job — that failure is invisible, and
 * automation quietly not happening is worse than a tick that shouldn't have
 * fired. Only an explicit `enabled = false` stops a job.
 */
export async function isJobEnabled(job: CronJob): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("cron_switches")
      .select("enabled")
      .eq("job", job)
      .maybeSingle();
    if (error) {
      console.warn(`[cron-switches] could not read ${job}, assuming enabled:`, error.message);
      return true;
    }
    if (!data) return true; // no row yet — treat as on, same as before this table existed
    return (data as { enabled: boolean }).enabled !== false;
  } catch (e) {
    console.warn(`[cron-switches] lookup threw for ${job}, assuming enabled:`, e);
    return true;
  }
}

/** Both switches, for the admin page. Missing rows read as enabled. */
export async function listJobSwitches(): Promise<CronSwitch[]> {
  const jobs = Object.keys(CRON_JOBS) as CronJob[];
  let rows: Array<Record<string, unknown>> = [];
  try {
    const { data } = await createAdminClient()
      .from("cron_switches")
      .select("job, enabled, note, updated_at, updated_by");
    rows = (data ?? []) as Array<Record<string, unknown>>;
  } catch {
    /* table not migrated yet — every job reports its default */
  }
  return jobs.map((job) => {
    const row = rows.find((r) => r.job === job);
    return {
      job,
      enabled: row ? row.enabled !== false : true,
      note: (row?.note as string | null) ?? null,
      updatedAt: (row?.updated_at as string | null) ?? null,
      updatedBy: (row?.updated_by as string | null) ?? null,
    };
  });
}

/** Flip one switch. Upserts so a job with no row yet can still be turned off. */
export async function setJobEnabled(
  job: CronJob,
  enabled: boolean,
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await createAdminClient()
      .from("cron_switches")
      .upsert(
        {
          job,
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy.slice(0, 200),
        },
        { onConflict: "job" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save that." };
  }
}

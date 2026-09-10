import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nobody may select a column from `agents` that `agents` does not have.
 *
 * PostgREST answers an unknown column with 42703 in `.error`, not a throw,
 * and `const { data } = await …` reads it as "no such agent". Seventeen
 * call sites selected `first_name` / `brokerage_name` / `name` / `email`
 * that way; the weekly growth digest never sent an email because of it.
 *
 * This is the column list of public.agents as of 2026-09-10. When a
 * migration adds a column, add it here too — that is the whole point.
 */
const AGENTS_COLUMNS = new Set([
  "id", "user_id", "brokerage", "phone", "created_at", "plan_type", "stripe_customer_id",
  "stripe_subscription_id", "auth_user_id", "service_areas", "accepts_new_leads",
  "ai_assistant_enabled", "ai_assistant_mode", "brand_name", "signature_html", "logo_url",
  "default_flyer_template", "onboarding_completed", "agent_photo_url", "service_areas_v2",
  "forwarding_phone", "briefing_morning_time", "briefing_evening_time",
  "lead_ad_privacy_policy_url", "deleted_at", "newsletter_token", "activation_nudge_last_at",
  "activation_nudge_count", "signup_attribution", "dt_intro_video_path", "dt_consent",
  "dt_consent_at", "dt_transcript", "dt_brand_profile", "dt_status", "dt_error", "dt_updated_at",
  "dt_avatar_script", "dt_avatar_video_url", "onboarding", "dt_portrait_path",
  "dt_intro_audio_path", "username", "bio", "specialties", "hub_published", "timezone",
]);

const APP_ROOT = resolve(__dirname, "../../..");
const SCAN = ["app", "lib", "components"];
const SELECT_ON_AGENTS = /\.from\(\s*"agents"\s*\)\s*\.select\(\s*(?:"([^"]*)"|`([^`]*)`)/g;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

/** "id, auth_user_id, foo:bar, rel(a, b)" → ["id", "auth_user_id", "bar"] (relations dropped). */
export function selectedColumns(select: string): string[] {
  const flat = select.replace(/\w+\s*\([^)]*\)/g, "");
  return flat
    .split(",")
    .map((c) => c.trim().split(":").pop()!.trim())
    .filter((c) => c && c !== "*" && !c.startsWith("count"));
}

describe("selects on agents", () => {
  it("only name columns agents actually has", () => {
    const offenders: string[] = [];
    for (const dir of SCAN) {
      for (const file of sourceFiles(join(APP_ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(SELECT_ON_AGENTS)) {
          const unknown = selectedColumns(m[1] ?? m[2] ?? "").filter((c) => !AGENTS_COLUMNS.has(c));
          if (unknown.length) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(`${relative(APP_ROOT, file).replace(/\\/g, "/")}:${line} selects ${unknown.join(", ")}`);
          }
        }
      }
    }
    expect(offenders, "agents has no such column; read names via lib/agents/displayIdentity.server.ts").toEqual([]);
  });
});

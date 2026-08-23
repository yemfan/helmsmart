import { NextResponse, type NextRequest } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRules } from "@/lib/compensation/repository";
import { diffRules } from "@/lib/compensation/diff";
import { DEFAULT_COMPENSATION_RULES } from "@/lib/compensation/defaults";
import type { CompensationRules } from "@/lib/compensation/types";

/**
 * Compensation configuration API.
 *
 * A change to compensation is never an in-place edit of a live version. It
 * creates a NEW version with its own effective date, records a field-level
 * change log, and leaves every historical commission pointing at the version it
 * was calculated under.
 */

interface CreateVersionPayload {
  planId?: string;
  label?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  rules?: unknown;
  reason?: string;
  /** "draft" keeps it invisible until activated; "active" makes it live. */
  status?: "draft" | "active";
  /** What happens to customers already on the previous version. */
  transitionPolicy?: "grandfather" | "migrate_on_renewal" | "migrate_immediately";
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const auth = await assertAdminForApi();
  if (!auth.ok) return bad(auth.message, auth.status);

  let payload: CreateVersionPayload;
  try {
    payload = (await request.json()) as CreateVersionPayload;
  } catch {
    return bad("We could not read that submission.");
  }

  const planId = typeof payload.planId === "string" ? payload.planId : null;
  const label = typeof payload.label === "string" ? payload.label.trim().slice(0, 80) : "";
  const effectiveFrom = typeof payload.effectiveFrom === "string" ? payload.effectiveFrom : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
  const status = payload.status === "active" ? "active" : "draft";
  const transitionPolicy = payload.transitionPolicy ?? "grandfather";

  if (!planId) return bad("Choose which plan this version belongs to.");
  if (!label) return bad("Give the version a label, for example \"Plan V2\".");
  if (!ISO_DATE.test(effectiveFrom)) return bad("Enter an effective date as YYYY-MM-DD.");
  if (!reason) {
    return bad("Enter a reason for this change. It is recorded in the compensation change log.");
  }
  if (
    payload.effectiveUntil &&
    (!ISO_DATE.test(payload.effectiveUntil) || payload.effectiveUntil <= effectiveFrom)
  ) {
    return bad("The end date must be after the effective date.");
  }

  const rules: CompensationRules = parseRules(payload.rules);

  // Sanity checks that protect partners from an obviously wrong configuration.
  if (rules.direct.durationMonths < 1 || rules.direct.durationMonths > 600) {
    return bad("Direct commission duration must be between 1 and 600 months.");
  }
  if (rules.leadership.maxGenerations < 0 || rules.leadership.maxGenerations > 10) {
    return bad("Leadership generations must be between 0 and 10.");
  }
  if (rules.leadership.generationRatesBps.length < rules.leadership.maxGenerations) {
    return bad(
      `You allowed ${rules.leadership.maxGenerations} generations but only set ${rules.leadership.generationRatesBps.length} rate(s). Set a rate for each generation.`,
    );
  }
  if (rules.customerDiscount.defaultDiscountBps > rules.customerDiscount.maxDiscountBps) {
    return bad("The default customer discount cannot exceed the maximum customer discount.");
  }

  const supabase = createAdminClient();

  const { data: plan } = await supabase
    .from("abw_compensation_plans")
    .select("id, key, name")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return bad("That compensation plan no longer exists.", 404);

  const { data: existingVersions } = await supabase
    .from("abw_compensation_plan_versions")
    .select("id, version, status, rules, effective_from, effective_until")
    .eq("plan_id", planId)
    .order("version", { ascending: false });

  const versions = existingVersions ?? [];
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const currentActive = versions.find((v) => v.status === "active" && !v.effective_until);
  const previousRules = currentActive
    ? parseRules(currentActive.rules)
    : DEFAULT_COMPENSATION_RULES;

  const { data: created, error } = await supabase
    .from("abw_compensation_plan_versions")
    .insert({
      plan_id: planId,
      version: nextVersion,
      label,
      status,
      effective_from: effectiveFrom,
      effective_until: payload.effectiveUntil ?? null,
      rules,
      notes: reason,
      created_by: auth.userId,
      activated_at: status === "active" ? new Date().toISOString() : null,
    })
    .select("id, version")
    .single();

  if (error || !created) {
    return bad(`Could not save the new version: ${error?.message ?? "unknown error"}`, 500);
  }

  // Close the previous open-ended version so the two windows do not overlap.
  if (status === "active" && currentActive && !currentActive.effective_until) {
    await supabase
      .from("abw_compensation_plan_versions")
      .update({ effective_until: effectiveFrom })
      .eq("id", currentActive.id);

    await supabase.from("abw_compensation_plan_transitions").insert({
      plan_id: planId,
      from_version_id: currentActive.id,
      to_version_id: created.id,
      policy: transitionPolicy,
      applies_to: transitionPolicy === "grandfather" ? "new_customers" : "all_customers",
      effective_on: effectiveFrom,
      notes: reason,
      created_by: auth.userId,
    });
  }

  // The change log: one row per field that actually moved.
  const changes = diffRules(previousRules, rules);
  const logRows = changes.map((change) => ({
    admin_user_id: auth.userId,
    admin_email: auth.email,
    plan_id: planId,
    plan_version_id: created.id,
    setting_path: change.path,
    previous_value: change.previous,
    new_value: change.next,
    summary: change.summary,
    reason,
  }));

  logRows.push({
    admin_user_id: auth.userId,
    admin_email: auth.email,
    plan_id: planId,
    plan_version_id: created.id,
    setting_path: "version",
    previous_value: currentActive ? `v${currentActive.version}` : "none",
    new_value: `v${created.version} (${label})`,
    summary: `Created ${label} for plan "${plan.key}", effective ${effectiveFrom}, status ${status}. Transition policy: ${transitionPolicy}.`,
    reason,
  });

  await Promise.all([
    supabase.from("abw_compensation_audit_log").insert(logRows),
    supabase.from("abw_audit_logs").insert({
      actor_user_id: auth.userId,
      actor_email: auth.email,
      action: "compensation.version_created",
      entity_type: "compensation_plan_version",
      entity_id: created.id,
      before_state: currentActive ? { version: currentActive.version } : null,
      after_state: { version: created.version, label, status, effective_from: effectiveFrom },
      reason,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    versionId: created.id,
    version: created.version,
    changeCount: changes.length,
    message:
      status === "active"
        ? `${label} is now the active plan version. ${changes.length} setting${changes.length === 1 ? "" : "s"} changed, and every change is in the compensation change log. Existing commissions were not recalculated.`
        : `${label} saved as a draft. It has no effect until you activate it.`,
  });
}

/** Activate a draft version, or archive one that should no longer apply. */
export async function PATCH(request: NextRequest) {
  const auth = await assertAdminForApi();
  if (!auth.ok) return bad(auth.message, auth.status);

  let payload: { versionId?: string; status?: "active" | "archived"; reason?: string };
  try {
    payload = await request.json();
  } catch {
    return bad("We could not read that submission.");
  }

  const versionId = payload.versionId;
  const status = payload.status;
  const reason = (payload.reason ?? "").trim().slice(0, 500);

  if (!versionId) return bad("Choose a version to update.");
  if (status !== "active" && status !== "archived") {
    return bad("A version can only be activated or archived here.");
  }
  if (!reason) return bad("Enter a reason. It is recorded in the compensation change log.");

  const supabase = createAdminClient();
  const { data: version } = await supabase
    .from("abw_compensation_plan_versions")
    .select("id, plan_id, version, label, status")
    .eq("id", versionId)
    .maybeSingle();

  if (!version) return bad("That version no longer exists.", 404);

  const { error } = await supabase
    .from("abw_compensation_plan_versions")
    .update({
      status,
      activated_at: status === "active" ? new Date().toISOString() : null,
    })
    .eq("id", versionId);

  if (error) return bad(`Could not update the version: ${error.message}`, 500);

  await Promise.all([
    supabase.from("abw_compensation_audit_log").insert({
      admin_user_id: auth.userId,
      admin_email: auth.email,
      plan_id: version.plan_id,
      plan_version_id: version.id,
      setting_path: "version.status",
      previous_value: version.status,
      new_value: status,
      summary: `${version.label} status changed from ${version.status} to ${status}.`,
      reason,
    }),
    supabase.from("abw_audit_logs").insert({
      actor_user_id: auth.userId,
      actor_email: auth.email,
      action: "compensation.version_status_changed",
      entity_type: "compensation_plan_version",
      entity_id: version.id,
      before_state: { status: version.status },
      after_state: { status },
      reason,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    message: `${version.label} is now ${status}. Historical commissions are unchanged.`,
  });
}

// Attribute real work to the AI employee who did it, in the AI Workforce runtime, so
// the Executive Command Center can show what each actually did: Emma (the AI
// Receptionist) for calls and bookings, Mark (the AI COO) for the questions he answers
// in the Ask Mark panel. Every function here is BEST-EFFORT: it resolves the employee
// for the org, records to the runtime, and swallows all errors — a workforce hiccup
// must never break a live call, a booking or an answer. If the org hasn't seeded its
// workforce yet, getEmployee returns null and we no-op.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";
import { getEmployee, startRun, completeRun, incrementMetric, recordMetric } from "@helm/ai-workforce";

type Db = SupabaseClient<Database>;

const EMMA = "emma";
const MARK = "mark";

/** How many of the five activation steps this org has finished. */
export const SETUP_PROGRESS_METRIC = "setup_steps_complete";

/** Mark's daily KPI: questions the owner asked in Ask Mark that he answered. */
export const MARK_QUESTIONS_METRIC = "questions_answered";

/**
 * Count one answered question toward Mark's questions_answered KPI. `/api/ask` calls
 * this from `after()`, once the answer has finished streaming — so it can neither
 * delay nor fail the answer — and only when an answer actually arrived.
 */
export async function recordMarkAnswer(db: Db, orgId: string): Promise<void> {
  try {
    const mark = await getEmployee(db, orgId, MARK);
    if (!mark) return;
    await incrementMetric(db, orgId, { employeeId: mark.id, metricKey: MARK_QUESTIONS_METRIC });
  } catch (e) {
    console.error("[workforce] recordMarkAnswer failed:", e);
  }
}

export interface EmployeeRunRecord {
  status: "succeeded" | "failed" | "escalated";
  channel: string;
  subjectType?: string | null;
  subjectId?: string | null;
  outcome: Record<string, unknown>;
}

/**
 * Record one finished piece of an AI employee's work — a task Mark added, a
 * hand-off, a text Sarah sent once the owner approved it. Best-effort like the
 * rest of this file: no employee row (an unseeded workforce) or a failed write
 * is logged and swallowed, never raised into the action that did the work.
 */
export async function recordEmployeeRun(
  db: Db,
  orgId: string,
  slug: string,
  run: EmployeeRunRecord,
): Promise<void> {
  try {
    const employee = await getEmployee(db, orgId, slug);
    if (!employee) return;
    const runId = await startRun(db, orgId, {
      employeeId: employee.id,
      channel: run.channel,
      subjectType: run.subjectType ?? null,
      subjectId: run.subjectId ?? null,
    });
    await completeRun(db, orgId, runId, { status: run.status, outcome: run.outcome });
  } catch (e) {
    console.error(`[workforce] recordEmployeeRun(${slug}) failed:`, e);
  }
}

/** Bump Emma's appointments_booked KPI for one successful receptionist booking. */
export async function recordEmmaBooking(db: Db, orgId: string): Promise<void> {
  try {
    const emma = await getEmployee(db, orgId, EMMA);
    if (!emma) return;
    await incrementMetric(db, orgId, { employeeId: emma.id, metricKey: "appointments_booked" });
  } catch (e) {
    console.error("[workforce] recordEmmaBooking failed:", e);
  }
}

export interface CallAttribution {
  callId: string;
  outcome?: Record<string, unknown>;
}

/**
 * Record a completed inbound call as one of Emma's runs and bump calls_answered.
 * Idempotent on (subject_type="call", subject_id=callId): a re-delivered call_analyzed
 * webhook is skipped, so the run + metric are counted exactly once per call.
 */
export async function attributeCallToEmma(db: Db, orgId: string, args: CallAttribution): Promise<void> {
  try {
    const emma = await getEmployee(db, orgId, EMMA);
    if (!emma) return;

    const { data: already } = await db
      .from("ai_employee_runs")
      .select("id")
      .eq("organization_id", orgId)
      .eq("employee_id", emma.id)
      .eq("subject_type", "call")
      .eq("subject_id", args.callId)
      .maybeSingle();
    if (already) return;

    const runId = await startRun(db, orgId, {
      employeeId: emma.id,
      channel: "voice",
      subjectType: "call",
      subjectId: args.callId,
    });
    await completeRun(db, orgId, runId, { status: "succeeded", outcome: args.outcome ?? {} });
    await incrementMetric(db, orgId, { employeeId: emma.id, metricKey: "calls_answered" });
  } catch (e) {
    console.error("[workforce] attributeCallToEmma failed:", e);
  }
}

/**
 * How far the owner has got setting Emma up, as a daily number.
 *
 * `recordMetric` sets an EXACT value rather than bumping a counter, on purpose:
 * the progress is recomputed from the org's own rows every time a setup step
 * saves, so re-recording the same number is a no-op and a step completed twice
 * cannot inflate it. Best-effort like the rest of this file — an org with no
 * seeded workforce records nothing, and a failed write never reaches the save
 * the owner was actually doing.
 */
export async function recordSetupProgress(db: Db, orgId: string, stepsDone: number): Promise<void> {
  try {
    const emma = await getEmployee(db, orgId, EMMA);
    if (!emma) return;
    await recordMetric(db, orgId, {
      employeeId: emma.id,
      metricKey: SETUP_PROGRESS_METRIC,
      metricValue: stepsDone,
    });
  } catch (e) {
    console.error("[workforce] recordSetupProgress failed:", e);
  }
}

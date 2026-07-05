import { describe, expect, it } from "vitest";
import {
  planAutoEnrollment,
  resolveProgramStatuses,
  type EnrollmentRow,
} from "../enrollment";

function row(
  slug: EnrollmentRow["programSlug"],
  optedOutAt: string | null = null,
): EnrollmentRow {
  return {
    programSlug: slug,
    enrolledAt: "2026-01-01T00:00:00Z",
    optedOutAt,
  };
}

describe("resolveProgramStatuses", () => {
  it("starter → both programs 'not_eligible'", () => {
    const out = resolveProgramStatuses({ plan: "starter", enrollments: [] });
    expect(out.map((p) => p.status)).toEqual(["not_eligible", "not_eligible"]);
  });

  it("growth (Pro) with no enrollments → Producer Track eligible_not_enrolled, Top not_eligible", () => {
    const out = resolveProgramStatuses({ plan: "pro", enrollments: [] });
    expect(out[0]).toMatchObject({ programSlug: "producer_track", status: "eligible_not_enrolled" });
    expect(out[1]).toMatchObject({ programSlug: "top_producer_track", status: "not_eligible" });
  });

  it("elite with active Top Producer enrollment → 'enrolled'", () => {
    const out = resolveProgramStatuses({
      plan: "premium",
      enrollments: [row("top_producer_track")],
    });
    expect(out[1]).toMatchObject({ programSlug: "top_producer_track", status: "enrolled" });
  });

  it("opted_out flag carries through when the agent has left a program", () => {
    const out = resolveProgramStatuses({
      plan: "premium",
      enrollments: [row("producer_track", "2026-04-01T00:00:00Z")],
    });
    expect(out[0].status).toBe("opted_out");
    expect(out[0].optedOutAt).toBe("2026-04-01T00:00:00Z");
  });

  it("preserves PROGRAM_ORDER regardless of enrollment-row order", () => {
    const out = resolveProgramStatuses({
      plan: "premium",
      enrollments: [row("top_producer_track"), row("producer_track")],
    });
    expect(out.map((p) => p.programSlug)).toEqual([
      "producer_track",
      "top_producer_track",
    ]);
  });
});

describe("planAutoEnrollment", () => {
  it("starter / null plan auto-enrolls nothing", () => {
    const out = planAutoEnrollment({ plan: null, existing: [] });
    expect(out.enroll).toEqual([]);
    expect(out.skip.every((s) => s.reason === "not_eligible")).toBe(true);
  });

  it("growth (Pro) with no enrollments → enroll Producer Track only", () => {
    const out = planAutoEnrollment({ plan: "pro", existing: [] });
    expect(out.enroll).toEqual(["producer_track"]);
    expect(out.skip).toContainEqual({
      slug: "top_producer_track",
      reason: "not_eligible",
    });
  });

  it("elite (Premium) with no enrollments → enroll BOTH programs", () => {
    const out = planAutoEnrollment({ plan: "premium", existing: [] });
    expect(out.enroll.sort()).toEqual(["producer_track", "top_producer_track"]);
    expect(out.skip).toEqual([]);
  });

  it("signature with no enrollments → enroll BOTH programs (Top Producer Track included on Signature)", () => {
    const out = planAutoEnrollment({ plan: "signature", existing: [] });
    expect(out.enroll.sort()).toEqual(["producer_track", "top_producer_track"]);
    expect(out.skip).toEqual([]);
  });

  it("team with no enrollments → enroll BOTH programs (Top Producer Track included on Team)", () => {
    const out = planAutoEnrollment({ plan: "team", existing: [] });
    expect(out.enroll.sort()).toEqual(["producer_track", "top_producer_track"]);
    expect(out.skip).toEqual([]);
  });

  it("idempotent: existing active enrollment skips with 'already_enrolled'", () => {
    const out = planAutoEnrollment({
      plan: "premium",
      existing: [row("producer_track")],
    });
    expect(out.enroll).toEqual(["top_producer_track"]);
    expect(out.skip).toContainEqual({
      slug: "producer_track",
      reason: "already_enrolled",
    });
  });

  it("respects prior opt-out: does NOT re-enroll the agent automatically", () => {
    const out = planAutoEnrollment({
      plan: "premium",
      existing: [row("producer_track", "2026-04-01T00:00:00Z")],
    });
    expect(out.enroll).toEqual(["top_producer_track"]);
    expect(out.skip).toContainEqual({
      slug: "producer_track",
      reason: "previously_opted_out",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
  dateIn,
  deadlineOf,
  parseTrainingInput,
  sortTrainings,
  statusFor,
  summarizeMember,
  trackedMembers,
  TITLE_MAX,
  type Training,
} from "../training";

const TZ = "America/Los_Angeles";

function training(over: Partial<Training> = {}): Training {
  return {
    id: "t1",
    title: "Fair housing refresher",
    description: null,
    required: true,
    startsAt: null,
    location: null,
    materialsUrl: null,
    dueOn: null,
    createdBy: "24",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("parseTrainingInput", () => {
  it("accepts a scheduled mandatory class with a due date and trims it", () => {
    const r = parseTrainingInput({ title: "  Contract writing 101 ", required: "1", startsAt: "2026-09-20T17:00:00.000Z", location: " Room B ", dueOn: "2026-09-30", description: "" });
    expect(r).toEqual({
      ok: true,
      training: { title: "Contract writing 101", description: null, required: true, startsAt: "2026-09-20T17:00:00.000Z", location: "Room B", materialsUrl: null, dueOn: "2026-09-30" },
    });
  });

  it("drops a due date from an optional class", () => {
    const r = parseTrainingInput({ title: "Staging tips", required: "0", dueOn: "2026-09-30" });
    expect(r.ok && r.training.dueOn).toBe(null);
    expect(r.ok && r.training.required).toBe(false);
  });

  it("rejects a missing or long title, a bad link and bad dates", () => {
    expect(parseTrainingInput({ title: " " })).toEqual({ ok: false, field: "title", reason: "required" });
    expect(parseTrainingInput({ title: "a".repeat(TITLE_MAX + 1) })).toEqual({ ok: false, field: "title", reason: "too_long" });
    expect(parseTrainingInput({ title: "x", materialsUrl: "drive/folder" })).toEqual({ ok: false, field: "materialsUrl", reason: "bad_url" });
    expect(parseTrainingInput({ title: "x", startsAt: "next tuesday" })).toEqual({ ok: false, field: "startsAt", reason: "bad_date" });
    expect(parseTrainingInput({ title: "x", required: "1", dueOn: "2026-02-30" })).toEqual({ ok: false, field: "dueOn", reason: "bad_date" });
  });
});

describe("dates", () => {
  it("reads the calendar date where the viewer is, not in UTC", () => {
    // 02:00 UTC on the 21st is still the evening of the 20th in Los Angeles.
    expect(dateIn("2026-09-21T02:00:00.000Z", TZ)).toBe("2026-09-20");
    expect(dateIn("2026-09-21T02:00:00.000Z", "UTC")).toBe("2026-09-21");
  });

  it("adds days across a month and a year end", () => {
    expect(addDays("2026-09-25", 30)).toBe("2026-10-25");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("uses the due date, else the class date, else no deadline", () => {
    expect(deadlineOf({ dueOn: "2026-09-30", startsAt: "2026-09-20T17:00:00.000Z" }, TZ)).toBe("2026-09-30");
    expect(deadlineOf({ dueOn: null, startsAt: "2026-09-21T02:00:00.000Z" }, TZ)).toBe("2026-09-20");
    expect(deadlineOf({ dueOn: null, startsAt: null }, TZ)).toBe(null);
  });
});

describe("statusFor", () => {
  const base = { joinedOn: "2026-01-10", timeZone: TZ };

  it("is done whenever a completion is on record, mandatory or not", () => {
    expect(statusFor({ ...base, training: training({ dueOn: "2026-09-01" }), done: true, today: "2026-09-11" })).toBe("done");
    expect(statusFor({ ...base, training: training({ required: false }), done: true, today: "2026-09-11" })).toBe("done");
  });

  it("is open for an optional class not taken, never overdue", () => {
    expect(statusFor({ ...base, training: training({ required: false, startsAt: "2026-01-01T17:00:00.000Z" }), done: false, today: "2026-09-11" })).toBe("open");
  });

  it("is due through the deadline day and overdue the day after", () => {
    const t = training({ dueOn: "2026-09-11" });
    expect(statusFor({ ...base, training: t, done: false, today: "2026-09-11" })).toBe("due");
    expect(statusFor({ ...base, training: t, done: false, today: "2026-09-12" })).toBe("overdue");
  });

  it("stays due when a mandatory class has no deadline at all", () => {
    expect(statusFor({ ...base, training: training(), done: false, today: "2030-01-01" })).toBe("due");
  });

  it("gives someone who joined after the deadline 30 days from joining", () => {
    const t = training({ dueOn: "2026-09-01" });
    expect(statusFor({ ...base, joinedOn: "2026-09-10", training: t, done: false, today: "2026-10-10" })).toBe("due");
    expect(statusFor({ ...base, joinedOn: "2026-09-10", training: t, done: false, today: "2026-10-11" })).toBe("overdue");
  });
});

describe("summarizeMember", () => {
  const list = [training({ id: "a", dueOn: "2026-09-01" }), training({ id: "b", dueOn: "2026-12-01" }), training({ id: "c", required: false })];
  const s = (done: string[]) => summarizeMember({ trainings: list, doneIds: new Set(done), joinedOn: "2026-01-01", today: "2026-09-11", timeZone: TZ });

  it("counts mandatory progress and what is overdue", () => {
    expect(s([])).toEqual({ requiredTotal: 2, requiredDone: 0, overdue: 1, optionalDone: 0, state: "behind" });
    expect(s(["a"])).toEqual({ requiredTotal: 2, requiredDone: 1, overdue: 0, optionalDone: 0, state: "in_progress" });
    expect(s(["a", "b", "c"])).toEqual({ requiredTotal: 2, requiredDone: 2, overdue: 0, optionalDone: 1, state: "current" });
  });

  it("says nothing is required when the office has only optional classes", () => {
    const only = summarizeMember({ trainings: [training({ id: "c", required: false })], doneIds: new Set(), joinedOn: null, today: "2026-09-11", timeZone: TZ });
    expect(only.state).toBe("none");
  });
});

describe("ordering and who is tracked", () => {
  it("lists mandatory first, then by class or due date, undated self-paced last", () => {
    const out = sortTrainings([
      training({ id: "opt", required: false, startsAt: "2026-09-12T17:00:00.000Z" }),
      training({ id: "late", dueOn: "2026-12-01" }),
      training({ id: "none", createdAt: "2026-09-05T00:00:00.000Z" }),
      training({ id: "soon", startsAt: "2026-09-15T17:00:00.000Z" }),
    ]);
    expect(out.map((t) => t.id)).toEqual(["soon", "late", "none", "opt"]);
  });

  it("does not track the owner", () => {
    const members = [
      { teamId: "t", agentId: "24", role: "owner" as const, createdAt: "" },
      { teamId: "t", agentId: "37", role: "member" as const, createdAt: "" },
      { teamId: "t", agentId: "43", role: "manager" as const, createdAt: "" },
    ];
    expect(trackedMembers(members).map((m) => m.agentId)).toEqual(["37", "43"]);
  });
});

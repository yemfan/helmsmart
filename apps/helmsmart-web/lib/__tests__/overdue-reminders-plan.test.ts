import { describe, expect, it } from "vitest";
import { planOverdueReminders } from "@/lib/overdue-reminders-plan";

const TODAY = "2026-09-10";

function row(id: string, email: string | null, lastReminderSentAt: string | null = null) {
  return { id, email, lastReminderSentAt };
}

describe("planOverdueReminders", () => {
  it("sends to every client with an email who was not reminded today", () => {
    const plan = planOverdueReminders(
      [row("a", "a@x.com"), row("b", "b@x.com", "2026-09-03T14:00:00+00:00")],
      TODAY,
    );
    expect(plan.send.map((r) => r.id)).toEqual(["a", "b"]);
    expect(plan.noEmail).toEqual([]);
    expect(plan.remindedToday).toEqual([]);
  });

  it("skips a client with no email — the send would refuse it", () => {
    const plan = planOverdueReminders([row("a", null), row("b", "   "), row("c", "c@x.com")], TODAY);
    expect(plan.noEmail.map((r) => r.id)).toEqual(["a", "b"]);
    expect(plan.send.map((r) => r.id)).toEqual(["c"]);
  });

  it("skips an invoice already reminded today (UTC day, like the dunning cron)", () => {
    const plan = planOverdueReminders(
      [row("a", "a@x.com", "2026-09-10T00:05:00+00:00"), row("b", "b@x.com", "2026-09-09T23:59:00+00:00")],
      TODAY,
    );
    expect(plan.remindedToday.map((r) => r.id)).toEqual(["a"]);
    expect(plan.send.map((r) => r.id)).toEqual(["b"]);
  });

  it("puts a missing email ahead of the same-day rule, so the reason shown is the one that matters", () => {
    const plan = planOverdueReminders([row("a", null, "2026-09-10T08:00:00+00:00")], TODAY);
    expect(plan.noEmail.map((r) => r.id)).toEqual(["a"]);
    expect(plan.remindedToday).toEqual([]);
  });

  it("returns an empty plan for no invoices", () => {
    expect(planOverdueReminders([], TODAY)).toEqual({ send: [], noEmail: [], remindedToday: [] });
  });
});

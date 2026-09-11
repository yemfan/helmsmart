import { describe, it, expect } from "vitest";
import {
  VOICE_RATE_CENTS_PER_MINUTE,
  billableMinutes,
  classifyCall,
  mergeCallLog,
  startOfDayUtc,
  summarizeCalls,
  talkMinutes,
  voicePeriodStart,
  type CallLike,
  type SessionLike,
} from "./voice-stats";

function session(p: Partial<SessionLike> & { id: string }): SessionLike {
  return { call_sid: null, created_at: "2026-09-01T12:00:00Z", status: "completed", spoke: false, ...p };
}
function call(p: Partial<CallLike> & { id: string }): CallLike {
  return { twilio_call_sid: null, called_at: "2026-09-01T12:00:00Z", status: "missed", auto_replied: false, ...p };
}

describe("voicePeriodStart", () => {
  it("is local midnight 29 days before today in the org's timezone", () => {
    // 2026-09-10 10:00 in Los Angeles (PDT, UTC-7) = 17:00Z.
    const now = new Date("2026-09-10T17:00:00Z");
    expect(voicePeriodStart("America/Los_Angeles", 30, now).toISOString()).toBe("2026-08-12T07:00:00.000Z");
  });

  it("uses the org's calendar day, not UTC's", () => {
    // 2026-09-11 02:00Z is still 2026-09-10 19:00 in Los Angeles.
    const now = new Date("2026-09-11T02:00:00Z");
    expect(voicePeriodStart("America/Los_Angeles", 30, now).toISOString()).toBe("2026-08-12T07:00:00.000Z");
    // …but already the 11th in UTC.
    expect(voicePeriodStart("UTC", 30, now).toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("gives today's midnight for a one-day window", () => {
    const now = new Date("2026-09-10T17:00:00Z");
    expect(voicePeriodStart("America/New_York", 1, now).toISOString()).toBe("2026-09-10T04:00:00.000Z");
  });

  it("crosses a DST change with the right offset at the start", () => {
    // Today is PDT; the window starts before spring-forward, in PST (UTC-8).
    const now = new Date("2026-03-20T19:00:00Z");
    expect(voicePeriodStart("America/Los_Angeles", 30, now).toISOString()).toBe("2026-02-19T08:00:00.000Z");
  });

  it("falls back to the default zone for an unset or invalid timezone", () => {
    const now = new Date("2026-09-10T17:00:00Z");
    const fallback = voicePeriodStart("America/New_York", 30, now).toISOString();
    expect(voicePeriodStart(null, 30, now).toISOString()).toBe(fallback);
    expect(voicePeriodStart("America/Los_Angles", 30, now).toISOString()).toBe(fallback);
  });
});

describe("startOfDayUtc", () => {
  it("handles a DST day in a zone east of UTC (Sydney, end of daylight time)", () => {
    // Midnight on 2026-04-05 in Sydney is still AEDT (UTC+11); the switch is at 03:00.
    expect(startOfDayUtc("2026-04-05", "Australia/Sydney").toISOString()).toBe("2026-04-04T13:00:00.000Z");
  });

  it("handles both US DST change days", () => {
    expect(startOfDayUtc("2026-03-08", "America/Los_Angeles").toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(startOfDayUtc("2026-11-01", "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});

describe("minutes and cost", () => {
  it("bills each call rounded up to the whole minute", () => {
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(null)).toBe(0);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
  });

  it("shows talk time to one decimal", () => {
    expect(talkMinutes(0)).toBe(0);
    expect(talkMinutes(61)).toBe(1);
    expect(talkMinutes(90)).toBe(1.5);
    expect(talkMinutes(95)).toBe(1.6);
  });

  it("charges $0.10 per billable minute, rounded per call rather than on the total", () => {
    expect(VOICE_RATE_CENTS_PER_MINUTE).toBe(10);
    const stats = summarizeCalls([
      { session: session({ id: "a", duration_seconds: 61, spoke: true }), call: null },
      { session: session({ id: "b", duration_seconds: 61, spoke: true }), call: null },
    ]);
    expect(stats.talkSeconds).toBe(122);
    expect(stats.billableMinutes).toBe(4); // 2 + 2, not ceil(122 / 60) = 3
    expect(stats.estCostCents).toBe(40);
  });
});

describe("summarizeCalls", () => {
  it("is all zeros for no calls", () => {
    expect(summarizeCalls([])).toEqual({
      totalCalls: 0,
      answeredByAi: 0,
      booked: 0,
      messagesTaken: 0,
      missed: 0,
      autoTexted: 0,
      talkSeconds: 0,
      billableMinutes: 0,
      estCostCents: 0,
    });
  });

  it("puts every call in exactly one bucket", () => {
    const rows = mergeCallLog(
      [
        session({ id: "s1", call_sid: "call_1", booked_event_id: "e1", spoke: true, duration_seconds: 95 }),
        session({ id: "s2", call_sid: "call_2", spoke: true, duration_seconds: 40 }),
        session({ id: "s3", call_sid: "call_3", spoke: false, duration_seconds: 4 }),
        session({ id: "s4", call_sid: "call_4", spoke: false }),
      ],
      [
        // The webhook's text-back row for s4 — the same call, not a second one.
        call({ id: "c4", twilio_call_sid: "call_4", status: "missed", auto_replied: true }),
        call({ id: "c5", twilio_call_sid: "CA5", status: "voicemail" }),
        call({ id: "c6", status: "answered" }),
      ],
    );
    const stats = summarizeCalls(rows);
    expect(stats.totalCalls).toBe(6);
    expect(stats.booked).toBe(1);
    expect(stats.messagesTaken).toBe(1);
    expect(stats.answeredByAi).toBe(2);
    expect(stats.missed).toBe(3); // s3 hung up, s4/c4 missed, c5 voicemail
    expect(stats.autoTexted).toBe(1);
    expect(stats.talkSeconds).toBe(139);
    expect(stats.booked + stats.messagesTaken + stats.missed + 1 /* c6 answered */).toBe(stats.totalCalls);
  });
});

describe("mergeCallLog", () => {
  it("joins a session and a calls row on call SID and sorts newest first", () => {
    const rows = mergeCallLog(
      [session({ id: "s1", call_sid: "call_1", created_at: "2026-09-02T10:00:00Z" })],
      [
        call({ id: "c1", twilio_call_sid: "call_1", called_at: "2026-09-02T10:00:05Z" }),
        call({ id: "c2", called_at: "2026-09-03T10:00:00Z" }),
      ],
    );
    expect(rows.map((r) => r.key)).toEqual(["c:c2", "s:s1"]);
    expect(rows[1].call?.id).toBe("c1");
  });

  it("leaves rows without a SID unjoined", () => {
    const rows = mergeCallLog([session({ id: "s1" })], [call({ id: "c1" })]);
    expect(rows).toHaveLength(2);
  });
});

describe("classifyCall", () => {
  it("prefers a booking over the missed-call log", () => {
    expect(classifyCall({ session: session({ id: "s", booked_event_id: "e" }), call: call({ id: "c" }) })).toBe("booked");
  });

  it("trusts the webhook's voicemail verdict over transcript turns", () => {
    expect(
      classifyCall({ session: session({ id: "s", spoke: true }), call: call({ id: "c", status: "voicemail" }) }),
    ).toBe("voicemail");
  });

  it("reads a live AI call as in progress and a silent one as missed", () => {
    expect(classifyCall({ session: session({ id: "s", status: "active" }), call: null })).toBe("inProgress");
    expect(classifyCall({ session: session({ id: "s" }), call: null })).toBe("missed");
  });

  it("reads the plain line's own statuses", () => {
    expect(classifyCall({ session: null, call: call({ id: "c", status: "answered" }) })).toBe("answered");
    expect(classifyCall({ session: null, call: call({ id: "c", status: "missed" }) })).toBe("missed");
  });
});

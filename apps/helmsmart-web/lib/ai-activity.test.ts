import { describe, it, expect } from "vitest";
import en from "../messages/en/home.json";
import {
  buildActivityFeed,
  clientDisplayName,
  type ActivityInput,
  type ActivityFormat,
} from "./ai-activity";
import { formatPhoneDisplay } from "./phone-display";

/** The real English bundle, with i18next's `{{x}}` interpolation and _one/_other plurals. */
function tr(key: string, opts: Record<string, unknown> = {}): string {
  const path = key.split(".");
  let node: unknown = en;
  for (const p of path.slice(0, -1)) node = (node as Record<string, unknown> | undefined)?.[p];
  const leaf = path[path.length - 1];
  const bag = node as Record<string, unknown> | undefined;
  const count = typeof opts.count === "number" ? opts.count : undefined;
  const raw = count !== undefined ? bag?.[`${leaf}_${count === 1 ? "one" : "other"}`] ?? bag?.[leaf] : bag?.[leaf];
  if (typeof raw !== "string") return `MISSING:${key}`;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? ""));
}

const fmt: ActivityFormat = { t: tr, when: (iso) => `WHEN(${iso})` };
const NOW = new Date("2026-09-10T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function input(over: Partial<ActivityInput> = {}): ActivityInput {
  return {
    voiceSessions: [],
    calls: [],
    socialPosts: [],
    runs: [],
    queue: [],
    texts: [],
    clientNames: {},
    eventStarts: {},
    employees: {
      emma: { name: "Emma", avatar: "persona-02" },
      sarah: { name: "Sarah", avatar: "persona-05" },
      emily: { name: "Emily", avatar: "persona-14" },
      alex: { name: "Alex", avatar: "persona-06" },
    },
    ...over,
  };
}

const voice = (over: Partial<ActivityInput["voiceSessions"][number]>) => ({
  id: "v1",
  call_sid: "call_1",
  direction: "inbound",
  purpose: null,
  status: "completed",
  from_number: "+14155550143",
  to_number: "+16265550100",
  client_id: null,
  booked_event_id: null,
  created_at: hoursAgo(1),
  ...over,
});

describe("buildActivityFeed", () => {
  it("says who answered a call and what it booked", () => {
    const rows = buildActivityFeed(
      input({
        voiceSessions: [voice({ booked_event_id: "e1" })],
        eventStarts: { e1: "2026-09-15T22:00:00Z" },
      }),
      fmt,
      { now: NOW },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].who).toEqual({ kind: "employee", slug: "emma", name: "Emma", avatar: "persona-02" });
    expect(rows[0].text).toBe("Emma answered a call from (415) 555-0143");
    expect(rows[0].detail).toBe("booked WHEN(2026-09-15T22:00:00Z)");
    expect(rows[0].href).toBe("/voice");
  });

  it("uses the business's own name for the receptionist", () => {
    const rows = buildActivityFeed(
      input({ voiceSessions: [voice({})], employees: { emma: { name: "Rosa", avatar: "persona-09" } } }),
      fmt,
      { now: NOW },
    );
    expect(rows[0].text).toBe("Rosa answered a call from (415) 555-0143");
  });

  it("names a known caller instead of the number", () => {
    const rows = buildActivityFeed(
      input({ voiceSessions: [voice({ client_id: "c1" })], clientNames: { c1: "Priya Patel" } }),
      fmt,
      { now: NOW },
    );
    expect(rows[0].text).toBe("Emma answered a call from Priya Patel");
  });

  it("does not call a missed call 'answered' — it shows the text-back instead", () => {
    const rows = buildActivityFeed(
      input({
        voiceSessions: [voice({ call_sid: "call_missed", from_number: "+15105550133" })],
        calls: [
          {
            id: "k1",
            twilio_call_sid: "call_missed",
            from_number: "+15105550133",
            client_id: null,
            status: "missed",
            auto_replied: true,
            called_at: hoursAgo(1),
          },
        ],
      }),
      fmt,
      { now: NOW },
    );
    expect(rows.map((r) => r.text)).toEqual(["Missed-call text sent to (510) 555-0133"]);
    expect(rows[0].who).toEqual({ kind: "automatic" });
  });

  it("gives reminder calls to 'automatic' and other outbound calls to Sarah, with the purpose", () => {
    const rows = buildActivityFeed(
      input({
        voiceSessions: [
          voice({ id: "v1", direction: "outbound", purpose: "appointment_reminder", client_id: "c1", created_at: hoursAgo(2) }),
          voice({ id: "v2", direction: "outbound", purpose: "follow_up", client_id: "c2", created_at: hoursAgo(1) }),
          voice({ id: "v3", direction: "outbound", purpose: "something_new", client_id: "c2", created_at: hoursAgo(3) }),
        ],
        clientNames: { c1: "Amanda Reyes", c2: "Luis Ortega" },
      }),
      fmt,
      { now: NOW },
    );
    expect(rows.map((r) => [r.who.kind, r.text, r.detail])).toEqual([
      ["employee", "Sarah called Luis Ortega", "follow-up"],
      ["automatic", "Reminder call to Amanda Reyes", null],
      // An unknown purpose gets no detail rather than a raw key.
      ["employee", "Sarah called Luis Ortega", null],
    ]);
  });

  it("lists a post only when the schedule published an AI-written one", () => {
    const rows = buildActivityFeed(
      input({
        socialPosts: [
          { id: "p1", platform: "facebook", published_at: hoursAgo(1), scheduled_at: hoursAgo(1), generated_by_ai: true },
          { id: "p2", platform: "linkedin", published_at: hoursAgo(2), scheduled_at: null, generated_by_ai: true },
          { id: "p3", platform: "threads", published_at: hoursAgo(3), scheduled_at: hoursAgo(3), generated_by_ai: false },
        ],
      }),
      fmt,
      { now: NOW },
    );
    expect(rows.map((r) => r.text)).toEqual(["Emily published a post to Facebook"]);
  });

  it("turns approval escalations into lines that point at Tasks, and skips voice runs", () => {
    const rows = buildActivityFeed(
      input({
        runs: [
          { id: "r1", employee_slug: "sarah", channel: "sms", subject_type: "contact", subject_id: "c1", status: "escalated", outcome: {}, started_at: hoursAgo(1) },
          { id: "r2", employee_slug: "alex", channel: "email", subject_type: "invoice", subject_id: "i1", status: "escalated", outcome: {}, started_at: hoursAgo(2) },
          { id: "r3", employee_slug: "emma", channel: "voice", subject_type: "call", subject_id: "call_1", status: "succeeded", outcome: {}, started_at: hoursAgo(3) },
          { id: "r4", employee_slug: "emma", channel: "sms", subject_type: "contact", subject_id: "c2", status: "succeeded", outcome: { booked: true }, started_at: hoursAgo(4) },
          { id: "r5", employee_slug: "emma", channel: "sms", subject_type: "contact", subject_id: "c2", status: "succeeded", outcome: { booked: false }, started_at: hoursAgo(5) },
        ],
        clientNames: { c1: "Amanda Reyes", c2: "Priya Patel" },
      }),
      fmt,
      { now: NOW },
    );
    expect(rows.map((r) => [r.text, r.href])).toEqual([
      ["Sarah drafted a text to Amanda Reyes for your approval", "/tasks"],
      ["Alex lined up payment reminders for your approval", "/tasks"],
      ["Emma booked Priya Patel by text", "/calendar"],
    ]);
  });

  it("adds reminder texts and unplaced calls from the queue, marking failures", () => {
    const rows = buildActivityFeed(
      input({
        queue: [
          { id: "q1", purpose: "appointment_reminder_sms", status: "done", client_id: "c1", updated_at: hoursAgo(1) },
          { id: "q2", purpose: "appointment_reminder", status: "done", client_id: "c1", updated_at: hoursAgo(2) },
          { id: "q3", purpose: "follow_up", status: "failed", client_id: "c1", updated_at: hoursAgo(3) },
        ],
        clientNames: { c1: "Amanda Reyes" },
      }),
      fmt,
      { now: NOW },
    );
    expect(rows.map((r) => [r.text, r.tone ?? null])).toEqual([
      ["Reminder text sent to Amanda Reyes", null],
      ["Sarah's call to Amanda Reyes wasn't placed", "warning"],
    ]);
  });

  it("folds Auto Pilot replies in one conversation into one line with a count", () => {
    const rows = buildActivityFeed(
      input({
        texts: [
          { id: "m1", client_id: "c1", to_address: "+14155550121", sent_by: "auto_pilot", sent_at: hoursAgo(3) },
          { id: "m2", client_id: "c1", to_address: "+14155550121", sent_by: "auto_pilot", sent_at: hoursAgo(1) },
          { id: "m3", client_id: "c1", to_address: "+14155550121", sent_by: "owner", sent_at: hoursAgo(2) },
        ],
        clientNames: { c1: "Priya Patel" },
      }),
      fmt,
      { now: NOW },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "text:m2",
      who: { kind: "autoPilot" },
      text: "Auto Pilot replied to Priya Patel",
      detail: "2 texts",
      at: hoursAgo(1),
    });
  });

  it("keeps the last 7 days, newest first, at most 8 lines", () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      voice({ id: `v${i}`, call_sid: `call_${i}`, created_at: hoursAgo(i * 20) }),
    );
    const rows = buildActivityFeed(input({ voiceSessions: sessions }), fmt, { now: NOW });
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.key)).toEqual(["v0", "v1", "v2", "v3", "v4", "v5", "v6", "v7"].map((id) => `voice:${id}`));

    const old = buildActivityFeed(input({ voiceSessions: [voice({ created_at: hoursAgo(24 * 8) })] }), fmt, { now: NOW });
    expect(old).toEqual([]);
  });

  it("falls back to 'someone' when there is neither a name nor a number", () => {
    const rows = buildActivityFeed(input({ voiceSessions: [voice({ from_number: null })] }), fmt, { now: NOW });
    expect(rows[0].text).toBe("Emma answered a call from someone");
  });

  it("has an English string for every key it can produce", () => {
    const rows = buildActivityFeed(
      input({
        voiceSessions: [voice({ booked_event_id: "e-missing" })],
        socialPosts: [{ id: "p1", platform: "general", published_at: hoursAgo(1), scheduled_at: hoursAgo(1), generated_by_ai: true }],
        runs: [{ id: "r1", employee_slug: "mark", channel: "task", subject_type: null, subject_id: null, status: "escalated", outcome: null, started_at: hoursAgo(1) }],
        queue: [
          { id: "q1", purpose: "appointment_reminder_sms", status: "failed", client_id: "c1", updated_at: hoursAgo(1) },
          { id: "q2", purpose: "appointment_reminder", status: "failed", client_id: "c1", updated_at: hoursAgo(1) },
        ],
      }),
      fmt,
      { now: NOW },
    );
    for (const r of rows) {
      expect(r.text).not.toMatch(/MISSING/);
      expect(r.detail ?? "").not.toMatch(/MISSING/);
    }
    expect(rows.map((r) => r.detail).filter(Boolean)).toContain("booked an appointment");
    expect(rows.map((r) => r.text)).toContain("Emily published a post to social media");
    expect(rows.map((r) => r.text)).toContain("mark is waiting for your approval");
  });
});

describe("clientDisplayName", () => {
  it("joins first and last name", () => {
    expect(clientDisplayName({ first_name: "Priya", last_name: "Patel" })).toBe("Priya Patel");
    expect(clientDisplayName({ first_name: " Priya ", last_name: null })).toBe("Priya");
  });
  it("treats the receptionist's 'Caller' placeholder as no name", () => {
    expect(clientDisplayName({ first_name: "Caller", last_name: null })).toBeNull();
    expect(clientDisplayName({ first_name: "caller", last_name: "" , company: "Acme" })).toBe("Acme");
  });
  it("falls back to the company, then to nothing", () => {
    expect(clientDisplayName({ first_name: "", company: "Harbor Law" })).toBe("Harbor Law");
    expect(clientDisplayName({})).toBeNull();
    expect(clientDisplayName(null)).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("formats US numbers", () => {
    expect(formatPhoneDisplay("+14155550121")).toBe("(415) 555-0121");
    expect(formatPhoneDisplay("4155550121")).toBe("(415) 555-0121");
    expect(formatPhoneDisplay("1 (415) 555-0121")).toBe("(415) 555-0121");
  });
  it("leaves anything else as it was given", () => {
    expect(formatPhoneDisplay("+442071838750")).toBe("+442071838750");
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay(null)).toBe("");
  });
});

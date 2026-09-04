import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Receptionist bookings are listed on both calendars under a `voice:` id and
 * offered the same Cancel control as manual events, but the patch looked them
 * up in lead_calendar_events, so pressing Cancel said "Event not found" about
 * an appointment that was right there. These pin the routing by id prefix.
 */

vi.mock("server-only", () => ({}));

const calls = {
  /** Every table `from()` was asked for, in order. */
  tables: [] as string[],
  /** The last update payload per table. */
  updates: {} as Record<string, Record<string, unknown>>,
  /** The values handed to `.eq()` per table. */
  eqs: {} as Record<string, Array<[string, unknown]>>,
};

const VOICE_ROW = {
  id: "va-1",
  contact_id: "contact-1",
  caller_name: "Dana Reyes",
  title: "Buyer consult",
  start_at: "2026-09-05T18:00:00.000Z",
  end_at: null,
  status: "cancelled",
  appointment_type: "consult",
  meeting_mode: "in_person",
  created_at: "2026-09-01T00:00:00.000Z",
};

const MANUAL_ROW = {
  id: "ev-1",
  contact_id: null,
  title: "Caravan",
  description: null,
  starts_at: "2026-09-05T18:00:00.000Z",
  ends_at: null,
  timezone: null,
  status: "cancelled",
  calendar_provider: null,
  external_event_id: null,
  external_calendar_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

function makeChain(table: string, row: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "is", "order", "limit", "gte", "lte", "neq"]) {
    chain[m] = () => chain;
  }
  chain.eq = (col: string, value: unknown) => {
    (calls.eqs[table] ??= []).push([col, value]);
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    calls.updates[table] = payload;
    return chain;
  };
  chain.then = undefined;
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.single = async () => ({ data: row, error: null });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      calls.tables.push(table);
      if (table === "voice_appointments") return makeChain(table, VOICE_ROW);
      if (table === "lead_calendar_events") return makeChain(table, MANUAL_ROW);
      return makeChain(table, {});
    },
  },
}));

const { patchMobileCalendarEvent, VOICE_BOOKING_READ_ONLY } = await import("../calendarMobile");

beforeEach(() => {
  calls.tables = [];
  calls.updates = {};
  calls.eqs = {};
});

describe("patchMobileCalendarEvent on a receptionist booking", () => {
  it("cancels the voice_appointments row and never touches lead_calendar_events", async () => {
    const event = await patchMobileCalendarEvent({
      agentId: "agent-1",
      eventId: "voice:va-1",
      status: "cancelled",
    });

    expect(calls.tables).toEqual(["voice_appointments"]);
    expect(calls.updates.voice_appointments).toEqual({ status: "cancelled" });
    // Scoped to the row AND the agent — one agent must not cancel another's booking.
    expect(calls.eqs.voice_appointments).toEqual([
      ["id", "va-1"],
      ["agent_id", "agent-1"],
    ]);
    expect(event.id).toBe("voice:va-1");
    expect(event.status).toBe("cancelled");
    expect(event.lead_name).toBe("Dana Reyes");
  });

  it("refuses to edit anything but the status, and writes nothing", async () => {
    await expect(
      patchMobileCalendarEvent({
        agentId: "agent-1",
        eventId: "voice:va-1",
        title: "Moved it",
      }),
    ).rejects.toThrow(VOICE_BOOKING_READ_ONLY);
    await expect(
      patchMobileCalendarEvent({
        agentId: "agent-1",
        eventId: "voice:va-1",
        status: "cancelled",
        startsAt: "2026-09-06T18:00:00.000Z",
      }),
    ).rejects.toThrow(VOICE_BOOKING_READ_ONLY);

    expect(calls.updates.voice_appointments).toBeUndefined();
    expect(calls.tables).toEqual([]);
  });
});

describe("patchMobileCalendarEvent on a manual event", () => {
  it("still goes to lead_calendar_events", async () => {
    const event = await patchMobileCalendarEvent({
      agentId: "agent-1",
      eventId: "ev-1",
      status: "cancelled",
    });

    expect(calls.tables).not.toContain("voice_appointments");
    expect(calls.tables[0]).toBe("lead_calendar_events");
    expect(calls.updates.lead_calendar_events).toMatchObject({ status: "cancelled" });
    expect(event.id).toBe("ev-1");
  });
});

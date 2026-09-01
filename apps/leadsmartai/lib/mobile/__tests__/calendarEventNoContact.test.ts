import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard's contact picker defaults to "No contact", but creating an
 * appointment that way 400'd with "leadId is required" and the UI rendered it
 * as a bare "Failed to add." `lead_calendar_events.contact_id` is nullable, so
 * the restriction was only ever in application code.
 *
 * These exercise the service layer through a stubbed Supabase client: what it
 * writes to contact_id, and whether it goes looking for a contact that isn't
 * there.
 */

vi.mock("server-only", () => ({}));

/** Records what each table was asked to do. */
const calls = {
  inserted: null as Record<string, unknown> | null,
  contactsQueried: 0,
  /** Every value list handed to .in() on the contacts table. */
  contactsInValues: [] as unknown[][],
};

function makeChain(result: unknown, table?: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "update", "order", "limit"]) {
    chain[m] = () => chain;
  }
  chain.in = (_col: string, values: unknown[]) => {
    if (table === "contacts") calls.contactsInValues.push(values);
    return chain;
  };
  chain.gte = () => chain;
  chain.lte = () => chain;
  chain.then = undefined;
  chain.maybeSingle = async () => ({ data: result, error: null });
  chain.single = async () => ({ data: result, error: null });
  chain.insert = (row: Record<string, unknown>) => {
    calls.inserted = row;
    return chain;
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "contacts") {
        calls.contactsQueried += 1;
        return makeChain({ id: "contact-1", name: "Dana Reyes" }, "contacts");
      }
      return makeChain({
        id: "event-1",
        contact_id: calls.inserted?.contact_id ?? null,
        title: "Test calendar",
        starts_at: "2026-08-31T18:00:00.000Z",
        status: "scheduled",
      });
    },
  },
}));

const { createMobileCalendarEvent, contactIdsForLookup } = await import(
  "../calendarMobile"
);

beforeEach(() => {
  calls.inserted = null;
  calls.contactsQueried = 0;
  calls.contactsInValues = [];
});

describe("createMobileCalendarEvent without a contact", () => {
  const base = {
    agentId: "26",
    title: "Test calendar",
    startsAt: "2026-08-31T18:00:00.000Z",
  };

  it("stores a null contact_id instead of refusing", async () => {
    await createMobileCalendarEvent({ ...base });
    expect(calls.inserted?.contact_id).toBeNull();
  });

  it("treats an empty-string contact as no contact", async () => {
    // The dashboard sends "" when the picker is left on "No contact"; a blank
    // string reaching contact_id would break the FK rather than mean "none".
    await createMobileCalendarEvent({ ...base, leadId: "   " });
    expect(calls.inserted?.contact_id).toBeNull();
  });

  it("does not look up a contact that was never given", async () => {
    // Both the ownership assert and the name lookup hit `contacts`. Neither is
    // meaningful with no contact, and the assert would have thrown NOT_FOUND.
    await createMobileCalendarEvent({ ...base, leadId: null });
    expect(calls.contactsQueried).toBe(0);
  });

  it("still returns a usable event so the UI can render it", async () => {
    const event = await createMobileCalendarEvent({ ...base });
    expect(event.id).toBe("event-1");
  });
});

describe("createMobileCalendarEvent with a contact", () => {
  it("still attaches and still checks ownership", async () => {
    // The permissive path must not become permissive for everyone: a supplied
    // contact is verified to belong to the agent exactly as before.
    await createMobileCalendarEvent({
      agentId: "26",
      leadId: "contact-1",
      title: "Showing at 4521 Rosewood",
      startsAt: "2026-08-31T18:00:00.000Z",
    });
    expect(calls.inserted?.contact_id).toBe("contact-1");
    expect(calls.contactsQueried).toBeGreaterThan(0);
  });
});

describe("contactIdsForLookup", () => {
  it("drops nulls instead of stringifying them", () => {
    // The regression: String(null) === "null", which Postgres rejects as a
    // uuid, so ONE contactless appointment 500'd the whole list query and the
    // calendar showed "Nothing scheduled this month" for every event the agent
    // had. Allowing contactless events made this reachable for the first time.
    expect(contactIdsForLookup([{ contact_id: null }])).toEqual([]);
    expect(contactIdsForLookup([{ contact_id: null }])).not.toContain("null");
  });

  it("keeps real ids alongside contactless rows", () => {
    expect(
      contactIdsForLookup([
        { contact_id: "11111111-1111-1111-1111-111111111111" },
        { contact_id: null },
        { contact_id: "22222222-2222-2222-2222-222222222222" },
      ]),
    ).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("de-duplicates", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(contactIdsForLookup([{ contact_id: id }, { contact_id: id }])).toEqual([id]);
  });

  it("ignores undefined and blank values", () => {
    expect(
      contactIdsForLookup([{ contact_id: undefined }, { contact_id: "" }, { contact_id: "  " }, {}]),
    ).toEqual([]);
  });

  it("returns nothing for no rows", () => {
    expect(contactIdsForLookup([])).toEqual([]);
  });
});

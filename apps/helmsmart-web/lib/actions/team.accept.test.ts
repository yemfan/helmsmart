/**
 * Accepting a team invitation takes the invited mailbox, not just the link.
 *
 * The bug: `acceptInvitation` checked that the token existed, was unused and
 * unexpired, and then added WHOEVER was signed in to the org with the invited
 * role. An invitation link forwarded, pasted in a shared channel or read over a
 * shoulder let any HelmSmart account join someone else's business. The link is
 * a pointer; the credential is the address the owner typed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

let locale: "en" | "es" | "zh-Hans" = "en";
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/auth/org-context", () => ({ getMemberOrgId: async () => null }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

// ─── A Supabase double ──────────────────────────────────────────────────────

type User = { id: string; email?: string; email_confirmed_at?: string | null } | null;
let user: User;
let invite: Record<string, unknown> | null;
let memberInsertError: { code?: string; message: string } | null;
let serviceClientsCreated = 0;

type Write = { table: string; op: "insert" | "update"; payload: unknown; filters: Array<[string, unknown]> };
const writes: Write[] = [];

function serviceChain(table: string) {
  let write: Write | null = null;
  const filters: Array<[string, unknown]> = [];
  const b = {
    select() { return b; },
    insert(payload: unknown) { write = { table, op: "insert", payload, filters }; writes.push(write); return b; },
    update(payload: unknown) { write = { table, op: "update", payload, filters }; writes.push(write); return b; },
    eq(c: string, v: unknown) { filters.push([c, v]); return b; },
    is(c: string, v: unknown) { filters.push([c, v]); return b; },
    single() { return b; },
    maybeSingle() { return b; },
    then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
      let r: { data: unknown; error: unknown } = { data: null, error: null };
      if (table === "team_invitations" && !write) r = { data: invite, error: null };
      else if (table === "organizations") r = { data: { name: "Acme Plumbing" }, error: null };
      else if (table === "organization_members" && write)
        r = { data: memberInsertError ? null : { id: "member-1" }, error: memberInsertError };
      return Promise.resolve(r).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  createServiceClient: async () => {
    serviceClientsCreated++;
    return { from: (table: string) => serviceChain(table) };
  },
}));

const { acceptInvitation } = await import("./team");
const { isInvitee } = await import("@/lib/team-invitations");

const pub = (l: "en" | "es" | "zh-Hans") => translatorFor(l, "public");

beforeEach(() => {
  locale = "en";
  user = { id: USER, email: "dana@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" };
  invite = {
    id: "inv-1",
    organization_id: ORG,
    role: "bookkeeper",
    email: "dana@example.com",
    expires_at: FUTURE,
    accepted_at: null,
  };
  memberInsertError = null;
  writes.length = 0;
  serviceClientsCreated = 0;
});

describe("acceptInvitation", () => {
  it("refuses an account whose email is not the invited one, and changes nothing", async () => {
    user = { id: USER, email: "someone.else@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" };

    const res = await acceptInvitation("tok");

    expect(res).toEqual({
      ok: false,
      error: pub("en")("join.wrongAccount.body", {
        invited: "dana@example.com",
        current: "someone.else@example.com",
      }),
    });
    // Not a member, and the invitation is still pending: the owner still sees it
    // in Settings → Team and can revoke it and invite the right address.
    expect(writes).toEqual([]);
  });

  it("lets the invited address in, whatever its case", async () => {
    user = { id: USER, email: "  Dana@Example.COM ", email_confirmed_at: "2026-09-01T00:00:00Z" };

    const res = await acceptInvitation("tok");

    expect(res).toEqual({ ok: true, orgId: ORG, orgName: "Acme Plumbing" });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      table: "organization_members",
      op: "insert",
      payload: { organization_id: ORG, user_id: USER, role: "bookkeeper" },
    });
    expect(writes[1]).toMatchObject({ table: "team_invitations", op: "update" });
    expect(writes[1].filters).toEqual([["id", "inv-1"], ["accepted_at", null]]);
  });

  it("wants the address confirmed, not merely typed at sign-up", async () => {
    user = { id: USER, email: "dana@example.com", email_confirmed_at: null };
    expect(await acceptInvitation("tok")).toEqual({ ok: false, error: pub("en")("join.accept.errors.unconfirmed") });
    expect(writes).toEqual([]);
  });

  it("refuses a signed-out caller before touching the service client", async () => {
    user = null;
    expect(await acceptInvitation("tok")).toEqual({ ok: false, error: pub("en")("join.accept.errors.signIn") });
    expect(serviceClientsCreated).toBe(0);
  });

  it("explains an unknown, used or expired invitation the way the page does", async () => {
    invite = null;
    expect(await acceptInvitation("tok")).toEqual({ ok: false, error: pub("en")("join.error.invalid.body") });

    invite = { id: "inv-1", organization_id: ORG, role: "viewer", email: "dana@example.com", expires_at: FUTURE, accepted_at: PAST };
    expect(await acceptInvitation("tok")).toEqual({ ok: false, error: pub("en")("join.error.accepted.body") });

    invite = { id: "inv-1", organization_id: ORG, role: "viewer", email: "dana@example.com", expires_at: PAST, accepted_at: null };
    expect(await acceptInvitation("tok")).toEqual({ ok: false, error: pub("en")("join.error.expired.body") });

    expect(writes).toEqual([]);
  });

  it("treats already being a member as joining", async () => {
    memberInsertError = { code: "23505", message: 'duplicate key value violates unique constraint "organization_members_pkey"' };
    expect(await acceptInvitation("tok")).toMatchObject({ ok: true, orgId: ORG });
  });

  it("never shows Postgres's own sentence", async () => {
    memberInsertError = { code: "42501", message: "permission denied for table organization_members" };
    const res = await acceptInvitation("tok");
    expect(res).toEqual({ ok: false, error: pub("en")("join.accept.error") });
    expect(JSON.stringify(res)).not.toContain("permission denied");
  });

  it("explains a wrong account in the visitor's language", async () => {
    user = { id: USER, email: "someone.else@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" };
    const english = pub("en")("join.wrongAccount.body", { invited: "dana@example.com", current: "someone.else@example.com" });
    for (const l of ["es", "zh-Hans"] as const) {
      locale = l;
      const res = await acceptInvitation("tok");
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error).not.toBe(english);
      expect(res.error).not.toContain("join.");
      expect(res.error).toContain("dana@example.com");
      expect(res.error).toContain("someone.else@example.com");
    }
  });
});

describe("isInvitee", () => {
  it("compares addresses case-insensitively, ignoring surrounding whitespace", () => {
    expect(isInvitee("dana@example.com", "Dana@Example.com")).toBe(true);
    expect(isInvitee("dana@example.com", " dana@example.com\n")).toBe(true);
    expect(isInvitee("dana@example.com", "dana@example.co")).toBe(false);
    expect(isInvitee("dana@example.com", "dana+work@example.com")).toBe(false);
  });

  it("never matches a missing address", () => {
    expect(isInvitee("dana@example.com", null)).toBe(false);
    expect(isInvitee("dana@example.com", undefined)).toBe(false);
    expect(isInvitee("", "")).toBe(false);
  });
});

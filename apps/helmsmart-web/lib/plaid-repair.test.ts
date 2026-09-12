/**
 * Repairing a bank whose login lapsed.
 *
 * The gap these cover: `lib/plaid-sync.ts` sets `status: 'error'` with Plaid's
 * error code when a bank refuses a sync, and `syncBankConnections` then skips
 * any connection that is not `active`. Nothing ever set it back. Plaid's
 * LOGIN_REPAIRED webhook does not close the gap either — Plaid sends that when
 * an item is repaired OUTSIDE our app, so a repair the owner performs in our
 * own Link session is reported by `onSuccess` and nowhere else. Left alone, a
 * bank the owner had just fixed would stay skipped forever.
 *
 * So there are two halves, and both are tested here: a link token that carries
 * the EXISTING access token (Plaid's update mode), and a route that puts the
 * connection back to `active` and catches up the transactions it missed.
 *
 * Arranged like `lib/plaid-sync.test.ts` — same Supabase double, same `after()`
 * queue, same Plaid mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));

/** Callbacks handed to `after()` — run by the test, as Next runs them after the response. */
const afterQueue: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
  after: (fn: () => unknown) => {
    afterQueue.push(fn);
  },
}));

let user: { id: string } | null;
/** What the membership guard answers; its own tests are in lib/auth/org-context.test.ts. */
let memberOrg: string | null;
vi.mock("@/lib/auth/org-context", () => ({ getMemberOrgId: async () => memberOrg }));

const plaid = { linkToken: vi.fn(), sync: vi.fn(), balance: vi.fn() };
vi.mock("plaid", () => ({
  Configuration: class {},
  PlaidEnvironments: { sandbox: "https://sandbox.plaid.com" },
  Products: { Transactions: "transactions" },
  CountryCode: { Us: "US" },
  PlaidApi: class {
    linkTokenCreate(req: unknown) { return plaid.linkToken(req); }
    transactionsSync(req: unknown) { return plaid.sync(req); }
    accountsBalanceGet(req: unknown) { return plaid.balance(req); }
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

vi.mock("@/lib/actions/categorize", () => ({
  categorizeTransactions: async () => ({ categorized: 0 }),
}));

// ─── A recording Supabase double ────────────────────────────────────────────

type Call = {
  client: "rls" | "service";
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};
const calls: Call[] = [];

/**
 * What `bank_connections` holds, across TWO orgs — so a query that forgets its
 * `organization_id` filter would visibly find the other business's row rather
 * than quietly finding nothing.
 */
type Row = {
  id: string;
  organization_id: string;
  plaid_access_token_enc: string;
  cursor: string | null;
  status: string;
  error_code: string | null;
};
let rows: Row[];

function matching(call: Call) {
  return rows.filter((r) =>
    call.filters.every(([col, val]) => (r as unknown as Record<string, unknown>)[col] === val),
  );
}

function result(call: Call) {
  if (call.table !== "bank_connections") return { data: [], error: null };
  const hits = matching(call);
  if (call.op === "update") {
    // Writes land in `rows`, so a later read sees what the write did. That is
    // what makes the post-repair sync a real test: `syncBankConnections`
    // selects `.eq("status", "active")`, so it finds this connection ONLY
    // because the repair flipped it out of `error` first.
    for (const r of hits) Object.assign(r, call.payload as Partial<Row>);
    // An update answers with the rows it changed, which is what the route
    // reads to tell "cleared the error" from "matched nothing".
    return { data: hits.map((r) => ({ id: r.id })), error: null };
  }
  return { data: hits, error: null };
}

function chain(client: Call["client"], table: string) {
  const call: Call = { client, table, op: "select", filters: [] };
  calls.push(call);
  const b = {
    select() { return b; },
    insert(payload: unknown) { call.op = "insert"; call.payload = payload; return b; },
    update(payload: unknown) { call.op = "update"; call.payload = payload; return b; },
    upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return b; },
    eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    in(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    single() { return b; },
    maybeSingle() {
      return {
        then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const r = result(call);
          return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }).then(resolve, reject);
        },
      };
    },
    then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result(call)).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => chain("rls", table),
  }),
  createServiceClient: async () => ({ from: (table: string) => chain("service", table) }),
}));

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

const linkTokenRoute = await import("@/app/api/plaid/create-link-token/route");
const repairRoute = await import("@/app/api/plaid/repair-connection/route");

const books = translatorFor("en", "books");

function post(body?: unknown) {
  return new Request("http://localhost/api/plaid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  calls.length = 0;
  user = { id: USER };
  memberOrg = ORG;
  // Both start broken, exactly as `lib/plaid-sync.ts` left them.
  rows = [
    {
      id: "conn-1",
      organization_id: ORG,
      plaid_access_token_enc: "enc:access-sandbox-1",
      cursor: null,
      status: "error",
      error_code: "ITEM_LOGIN_REQUIRED",
    },
    {
      id: "conn-other",
      organization_id: OTHER_ORG,
      plaid_access_token_enc: "enc:access-other",
      cursor: null,
      status: "error",
      error_code: "ITEM_LOGIN_REQUIRED",
    },
  ];
  plaid.linkToken.mockResolvedValue({ data: { link_token: "link-sandbox-1" } });
  plaid.sync.mockResolvedValue({
    data: { added: [], modified: [], removed: [], next_cursor: "cursor-1", has_more: false },
  });
  plaid.balance.mockResolvedValue({ data: { accounts: [] } });
});

describe("POST /api/plaid/create-link-token — update mode", () => {
  it("still asks for the Transactions product when linking a NEW bank", async () => {
    const res = await linkTokenRoute.POST(post({}));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ link_token: "link-sandbox-1" });
    const req = plaid.linkToken.mock.calls[0][0];
    expect(req.products).toEqual(["transactions"]);
    expect(req.access_token).toBeUndefined();
  });

  it("tolerates a request with no body at all, as the plain Link button sends", async () => {
    const res = await linkTokenRoute.POST(post());

    expect(res.status).toBe(200);
    expect(plaid.linkToken.mock.calls[0][0].products).toEqual(["transactions"]);
  });

  /**
   * Plaid rejects a token that names both — an access token already carries
   * its own products — so update mode sends `access_token` and NO `products`.
   */
  it("sends the existing access token and NO products for a repair", async () => {
    const res = await linkTokenRoute.POST(post({ connection_id: "conn-1" }));

    expect(res.status).toBe(200);
    const req = plaid.linkToken.mock.calls[0][0];
    expect(req.access_token).toBe("access-sandbox-1"); // decrypted
    expect(req.products).toBeUndefined();
  });

  it("loads that connection through the service client, scoped to the member's org", async () => {
    await linkTokenRoute.POST(post({ connection_id: "conn-1" }));

    const read = calls.find((c) => c.table === "bank_connections" && c.op === "select");
    expect(read?.client).toBe("service");
    expect(read?.filters).toEqual([["id", "conn-1"], ["organization_id", ORG]]);
  });

  /**
   * The access token is the entire credential for someone's bank, and the
   * service client bypasses RLS — so the `organization_id` filter is the only
   * thing standing between a guessed id and another business's Link session.
   */
  it("refuses a connection belonging to another org, and never calls Plaid", async () => {
    const res = await linkTokenRoute.POST(post({ connection_id: "conn-other" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.connectionNotFound") });
    expect(plaid.linkToken).not.toHaveBeenCalled();
  });

  it("refuses when the caller is a member of no org", async () => {
    memberOrg = null;
    const res = await linkTokenRoute.POST(post({ connection_id: "conn-1" }));

    expect(res.status).toBe(400);
    expect(plaid.linkToken).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in", async () => {
    user = null;
    const res = await linkTokenRoute.POST(post({ connection_id: "conn-1" }));

    expect(res.status).toBe(401);
    expect(plaid.linkToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/plaid/repair-connection", () => {
  it("puts the connection back to active and clears the error code", async () => {
    const res = await repairRoute.POST(post({ connection_id: "conn-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connection_id: "conn-1" });

    const update = calls.find((c) => c.table === "bank_connections" && c.op === "update");
    expect(update?.client).toBe("service");
    expect(update?.payload).toEqual({ status: "active", error_code: null });
    expect(update?.filters).toEqual([["id", "conn-1"], ["organization_id", ORG]]);
  });

  /**
   * The point of the repair: `syncBankConnections` skips anything that is not
   * `active`, so the connection has missed every sync since it broke. Catching
   * up runs in-process from `after()`, never as a request to our own sync
   * route — that would carry no Supabase session and be answered 401.
   */
  it("catches up the missed transactions after responding, never over HTTP", async () => {
    await repairRoute.POST(post({ connection_id: "conn-1" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(plaid.sync).not.toHaveBeenCalled(); // not until after() runs
    expect(afterQueue).toHaveLength(1);

    await afterQueue[0]();
    expect(plaid.sync).toHaveBeenCalledTimes(1);
    expect(plaid.sync.mock.calls[0][0].access_token).toBe("access-sandbox-1");
  });

  /**
   * The whole point, in one assertion: a connection still marked `error` is
   * skipped by `syncBankConnections`, so the catch-up only reaches Plaid
   * because the repair cleared the state first.
   */
  it("leaves the connection in a state the next scheduled sync will pick up", async () => {
    await repairRoute.POST(post({ connection_id: "conn-1" }));
    await afterQueue[0]();

    expect(rows.find((r) => r.id === "conn-1")).toMatchObject({
      status: "active",
      error_code: null,
    });
    expect(rows.find((r) => r.id === "conn-other")).toMatchObject({ status: "error" });
  });

  it("does not report success for a connection in another org", async () => {
    const res = await repairRoute.POST(post({ connection_id: "conn-other" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.connectionNotFound") });
    expect(afterQueue).toHaveLength(0);
  });

  it("does not report success for a connection that no longer exists", async () => {
    const res = await repairRoute.POST(post({ connection_id: "conn-gone" }));

    expect(res.status).toBe(404);
    expect(afterQueue).toHaveLength(0);
  });

  it("refuses when the caller is a member of no org, before touching anything", async () => {
    memberOrg = null;
    const res = await repairRoute.POST(post({ connection_id: "conn-1" }));

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(afterQueue).toHaveLength(0);
  });

  it("asks for a connection id rather than guessing one", async () => {
    const res = await repairRoute.POST(post({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.missingConnection") });
    expect(afterQueue).toHaveLength(0);
  });
});

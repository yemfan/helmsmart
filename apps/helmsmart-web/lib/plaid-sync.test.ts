/**
 * Linking a bank imports its transactions.
 *
 * The bug: after Plaid Link, `POST /api/plaid/exchange-token` kicked off the
 * first import by `fetch`ing `/api/plaid/sync` on itself. That request carried
 * the org cookie and nothing else — no Supabase session cookies — and the sync
 * route begins with `auth.getUser()`, so every initial sync was answered 401
 * and the bank sat linked with no transactions. Nothing surfaced it: the fetch
 * was fire-and-forget and its status was never read.
 *
 * Now the exchange route runs `syncBankConnections()` in-process from
 * `after()`, for the org it has already checked. These tests pin that it does
 * not go over HTTP, that the import works with no session at all by the time it
 * runs, and that the manual sync route still requires a signed-in member.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const ORG = "11111111-1111-4111-8111-111111111111";
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

const plaid = { exchange: vi.fn(), sync: vi.fn(), balance: vi.fn() };
vi.mock("plaid", () => ({
  Configuration: class {},
  PlaidEnvironments: { sandbox: "https://sandbox.plaid.com" },
  PlaidApi: class {
    itemPublicTokenExchange(req: unknown) { return plaid.exchange(req); }
    transactionsSync(req: unknown) { return plaid.sync(req); }
    accountsBalanceGet(req: unknown) { return plaid.balance(req); }
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

const categorize = vi.fn(async (_orgId: string) => ({ categorized: 0 }));
vi.mock("@/lib/actions/categorize", () => ({
  categorizeTransactions: (orgId: string) => categorize(orgId),
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
let connections: Array<{ id: string; plaid_access_token_enc: string; cursor: string | null }>;

function result(call: Call) {
  if (call.table === "bank_connections" && call.op === "insert") return { data: { id: "conn-1" }, error: null };
  if (call.table === "bank_connections" && call.op === "select") return { data: connections, error: null };
  if (call.table === "bank_accounts" && call.op === "select")
    return { data: [{ id: "acct-1", plaid_account_id: "plaid-acct-1" }], error: null };
  return { data: null, error: null };
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

const exchange = await import("@/app/api/plaid/exchange-token/route");
const syncRoute = await import("@/app/api/plaid/sync/route");
const { syncBankConnections } = await import("./plaid-sync");

const books = translatorFor("en", "books");

function post(body: unknown) {
  return new Request("http://localhost/api/plaid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const LINKED = {
  public_token: "public-sandbox-1",
  institution: { institution_id: "ins_1", name: "First Platypus Bank" },
  accounts: [{ id: "plaid-acct-1", name: "Checking", type: "depository", subtype: "checking", mask: "0000" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  calls.length = 0;
  user = { id: USER };
  memberOrg = ORG;
  connections = [{ id: "conn-1", plaid_access_token_enc: "enc:access-sandbox-1", cursor: null }];
  plaid.exchange.mockResolvedValue({ data: { access_token: "access-sandbox-1", item_id: "item-1" } });
  plaid.sync.mockResolvedValue({
    data: {
      added: [
        {
          account_id: "plaid-acct-1",
          transaction_id: "ptx-1",
          amount: 42.5,
          iso_currency_code: "USD",
          date: "2026-09-10",
          authorized_date: null,
          name: "HOME DEPOT #1234",
          merchant_name: "Home Depot",
          category: null,
          pending: false,
          pending_transaction_id: null,
          personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER" },
        },
      ],
      modified: [],
      removed: [],
      next_cursor: "cursor-1",
      has_more: false,
    },
  });
  plaid.balance.mockResolvedValue({ data: { accounts: [] } });
});

describe("POST /api/plaid/exchange-token", () => {
  it("starts the first import in-process after responding, never over HTTP", async () => {
    const res = await exchange.POST(post(LINKED));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connection_id: "conn-1" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(1);
    // Not yet: the owner gets their answer before the import starts.
    expect(plaid.sync).not.toHaveBeenCalled();
  });

  it("imports the linked bank's transactions with no session left to lean on", async () => {
    await exchange.POST(post(LINKED));

    // The second hop was where it broke: whatever runs now must not need the
    // caller's session, so take it away.
    user = null;
    memberOrg = null;
    const before = calls.length;
    await afterQueue[0]();
    const syncCalls = calls.slice(before);

    expect(syncCalls.every((c) => c.client === "service")).toBe(true);
    expect(plaid.sync).toHaveBeenCalledWith({ access_token: "access-sandbox-1", cursor: undefined, count: 500 });

    const load = syncCalls.find((c) => c.table === "bank_connections" && c.op === "select");
    expect(load?.filters).toEqual([["organization_id", ORG], ["status", "active"], ["id", "conn-1"]]);

    const upsert = syncCalls.find((c) => c.table === "bank_transactions" && c.op === "upsert");
    expect(upsert?.payload).toEqual([
      expect.objectContaining({ organization_id: ORG, account_id: "acct-1", plaid_transaction_id: "ptx-1", amount: 42.5 }),
    ]);

    const saved = syncCalls.find((c) => c.table === "bank_connections" && c.op === "update");
    expect(saved?.payload).toMatchObject({ cursor: "cursor-1", status: "active" });
    expect(saved?.filters).toEqual([["id", "conn-1"], ["organization_id", ORG]]);

    expect(categorize).toHaveBeenCalledWith(ORG);
  });

  it("does nothing for a caller who is not a member of the active org", async () => {
    memberOrg = null;
    const res = await exchange.POST(post(LINKED));
    expect(res.status).toBe(400);
    expect(plaid.exchange).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(0);
  });
});

describe("POST /api/plaid/sync", () => {
  it("still requires a signed-in caller", async () => {
    user = null;
    const res = await syncRoute.POST(post({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.unauthorized") });
    expect(plaid.sync).not.toHaveBeenCalled();
  });

  it("still requires membership of the active org", async () => {
    memberOrg = null;
    const res = await syncRoute.POST(post({}));
    expect(res.status).toBe(400);
    expect(plaid.sync).not.toHaveBeenCalled();
  });

  it("syncs the member's own org", async () => {
    const res = await syncRoute.POST(post({ connection_id: "conn-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      synced: [{ connection_id: "conn-1", added: 1, modified: 0, removed: 0 }],
    });
  });
});

describe("syncBankConnections", () => {
  it("calls Plaid for nothing when the org has no active connection", async () => {
    connections = [];
    expect(await syncBankConnections(ORG)).toEqual([]);
    expect(plaid.sync).not.toHaveBeenCalled();
    expect(categorize).not.toHaveBeenCalled();
  });

  it("marks a connection Plaid refuses as errored, in that org only", async () => {
    plaid.sync.mockRejectedValue({ response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } });
    const results = await syncBankConnections(ORG);
    expect(results).toEqual([
      { connection_id: "conn-1", added: 0, modified: 0, removed: 0, error: "ITEM_LOGIN_REQUIRED" },
    ]);
    const marked = calls.find((c) => c.table === "bank_connections" && c.op === "update");
    expect(marked?.payload).toEqual({ status: "error", error_code: "ITEM_LOGIN_REQUIRED" });
    expect(marked?.filters).toEqual([["id", "conn-1"], ["organization_id", ORG]]);
  });
});

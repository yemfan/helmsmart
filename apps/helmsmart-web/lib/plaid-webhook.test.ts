/**
 * Plaid's webhook: the only way a linked bank is synced after its first import.
 *
 * `create-link-token` has always registered `/api/plaid/webhook` on every Item,
 * but the route did not exist, so each SYNC_UPDATES_AVAILABLE was a 404 and a
 * bank stopped updating the moment it was linked. These tests pin what the
 * route has to get right:
 *
 *   - nothing is read or written unless Plaid's signature checks out — wrong
 *     key, a signature carried onto another body, stale `iat`, an `alg` other
 *     than ES256, an expired or unknown key;
 *   - the org comes from the Item, and the sync runs for that org and that
 *     connection only;
 *   - ITEM errors mark the connection, and LOGIN_REPAIRED un-marks it.
 *
 * Plaid and Supabase are doubles; the keys are real P-256 keys generated here,
 * so the signature check is the real one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { translatorFor } from "@/lib/i18n/translator";

const ORG = "11111111-1111-4111-8111-111111111111";

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

const plaid = { keyGet: vi.fn(), sync: vi.fn(), balance: vi.fn() };
vi.mock("plaid", () => ({
  Configuration: class {},
  PlaidEnvironments: { sandbox: "https://sandbox.plaid.com" },
  PlaidApi: class {
    webhookVerificationKeyGet(req: unknown) { return plaid.keyGet(req); }
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

// ─── A recording Supabase double holding one bank connection ────────────────

type Call = {
  table: string;
  op: "select" | "update" | "upsert";
  single: boolean;
  payload?: unknown;
  filters: Array<[string, unknown]>;
};
const calls: Call[] = [];

type Row = {
  id: string;
  organization_id: string;
  plaid_item_id: string;
  plaid_access_token_enc: string;
  cursor: string | null;
  status: string;
  error_code: string | null;
};
let row: Row;
let lookupFails: boolean;

function result(call: Call) {
  const matches = () => call.filters.every(([c, v]) => (row as Record<string, unknown>)[c] === v);
  if (call.table === "bank_connections") {
    if (call.op === "select") {
      if (call.single && lookupFails) return { data: null, error: { message: "connection refused" } };
      const hit = matches() ? { ...row } : null;
      return call.single ? { data: hit, error: null } : { data: hit ? [hit] : [], error: null };
    }
    if (call.op === "update" && matches()) Object.assign(row, call.payload);
  }
  if (call.table === "bank_accounts" && call.op === "select")
    return { data: [{ id: "acct-1", plaid_account_id: "plaid-acct-1" }], error: null };
  return { data: null, error: null };
}

function chain(table: string) {
  const call: Call = { table, op: "select", single: false, filters: [] };
  calls.push(call);
  const b = {
    select() { return b; },
    update(payload: unknown) { call.op = "update"; call.payload = payload; return b; },
    upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return b; },
    eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    in(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    maybeSingle() { call.single = true; return b; },
    then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result(call)).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("a webhook has no session; it must not use the RLS client");
  },
  createServiceClient: async () => ({ from: (table: string) => chain(table) }),
}));

const { POST } = await import("@/app/api/plaid/webhook/route");

const books = translatorFor("en", "books");

// ─── Signing, the way Plaid does ────────────────────────────────────────────

const plaidKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const strangerKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
const jwk = plaidKey.publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string; y: string };

/** A fresh kid per test, so the route's key cache never carries one test into the next. */
let kid: string;
let kidSeq = 0;
const expiredKids = new Set<string>();

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const segment = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function jwtFor(
  body: string,
  opts: { key?: KeyObject; iat?: number; alg?: string; kid?: string } = {}
): string {
  const header = segment({ alg: opts.alg ?? "ES256", kid: opts.kid ?? kid, typ: "JWT" });
  const payload = segment({ iat: opts.iat ?? Math.floor(Date.now() / 1000), request_body_sha256: sha256(body) });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: opts.key ?? plaidKey.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

/** Plaid sends the body pretty-printed; the hash is over exactly these bytes. */
function webhook(event: object, token: (body: string) => string | null = (body) => jwtFor(body)) {
  const body = JSON.stringify(event, null, 2);
  const jwt = token(body);
  return new Request("http://localhost/api/plaid/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(jwt ? { "plaid-verification": jwt } : {}) },
    body,
  }) as never;
}

const SYNC = {
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "item-1",
  initial_update_complete: true,
  historical_update_complete: true,
  environment: "sandbox",
};
const LOGIN_REQUIRED = {
  webhook_type: "ITEM",
  webhook_code: "ERROR",
  item_id: "item-1",
  error: {
    error_type: "ITEM_ERROR",
    error_code: "ITEM_LOGIN_REQUIRED",
    error_message: "the login details of this item have changed",
    display_message: null,
  },
  environment: "sandbox",
};
const PERMISSION_REVOKED = {
  webhook_type: "ITEM",
  webhook_code: "USER_PERMISSION_REVOKED",
  item_id: "item-1",
  error: { error_type: "ITEM_ERROR", error_code: "USER_PERMISSION_REVOKED" },
  environment: "sandbox",
};
const REPAIRED = { webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED", item_id: "item-1", environment: "sandbox" };

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  calls.length = 0;
  lookupFails = false;
  kid = `kid-${++kidSeq}`;
  row = {
    id: "conn-1",
    organization_id: ORG,
    plaid_item_id: "item-1",
    plaid_access_token_enc: "enc:access-sandbox-1",
    cursor: "cursor-0",
    status: "active",
    error_code: null,
  };
  plaid.keyGet.mockImplementation(async ({ key_id }: { key_id: string }) => {
    if (!key_id.startsWith("kid-")) {
      throw { response: { data: { error_code: "INVALID_WEBHOOK_VERIFICATION_KEY_ID" } } };
    }
    return {
      data: {
        key: { ...jwk, alg: "ES256", use: "sig", kid: key_id, created_at: 1, expired_at: expiredKids.has(key_id) ? 2 : null },
      },
    };
  });
  plaid.sync.mockResolvedValue({
    data: {
      added: [
        {
          account_id: "plaid-acct-1",
          transaction_id: "ptx-2",
          amount: 18.25,
          iso_currency_code: "USD",
          date: "2026-09-11",
          authorized_date: null,
          name: "SHELL OIL 5741",
          merchant_name: "Shell",
          category: null,
          pending: false,
          pending_transaction_id: null,
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

describe("POST /api/plaid/webhook — verification", () => {
  const minutes = (n: number) => Math.floor(Date.now() / 1000) - n * 60;

  it.each<[string, (body: string) => string | null]>([
    ["no Plaid-Verification header", () => null],
    ["a header that is not a JWT", () => "not-a-jwt"],
    ["a signature from a key that is not Plaid's", (body) => jwtFor(body, { key: strangerKey })],
    ["a genuine signature carried onto a different body", () =>
      jwtFor(JSON.stringify({ ...SYNC, item_id: "item-other" }, null, 2))],
    ["an iat more than five minutes old", (body) => jwtFor(body, { iat: minutes(6) })],
    ["an alg other than ES256", (body) => jwtFor(body, { alg: "HS256" })],
    ["a kid Plaid does not know", (body) => jwtFor(body, { kid: "rotated-away" })],
    ["a key Plaid has expired", (body) => {
      expiredKids.add(kid);
      return jwtFor(body);
    }],
  ])("refuses %s, and touches nothing", async (_case, token) => {
    const res = await POST(webhook(SYNC, token));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.webhookUnverified") });
    expect(calls).toEqual([]);
    expect(afterQueue).toEqual([]);
    expect(plaid.sync).not.toHaveBeenCalled();
  });

  it("does not even look up a key for an unsigned (alg: none) token", async () => {
    const res = await POST(webhook(SYNC, (body) => `${segment({ alg: "none", kid })}.${segment({ iat: minutes(0), request_body_sha256: sha256(body) })}.`));
    expect(res.status).toBe(401);
    expect(plaid.keyGet).not.toHaveBeenCalled();
  });

  it("accepts Plaid's signature, and asks Plaid for a key only once", async () => {
    expect((await POST(webhook(SYNC))).status).toBe(200);
    expect(plaid.keyGet).toHaveBeenCalledWith({ key_id: kid });
    const fetched = plaid.keyGet.mock.calls.length;

    expect((await POST(webhook(SYNC))).status).toBe(200);
    expect(plaid.keyGet).toHaveBeenCalledTimes(fetched);
  });

  it("stops accepting a cached key once Plaid rotates it out", async () => {
    const oldKid = kid;
    expect((await POST(webhook(SYNC))).status).toBe(200);

    // Plaid rotates: the old key is expired, and webhooks arrive under a new kid.
    expiredKids.add(oldKid);
    kid = `kid-${++kidSeq}`;
    expect((await POST(webhook(SYNC))).status).toBe(200);

    // The new kid's arrival refreshed the cache, so the old key is now refused.
    expect((await POST(webhook(SYNC, (body) => jwtFor(body, { kid: oldKid })))).status).toBe(401);
  });

  it("allows a few minutes of clock skew", async () => {
    expect((await POST(webhook(SYNC, (body) => jwtFor(body, { iat: minutes(4) })))).status).toBe(200);
  });
});

describe("TRANSACTIONS SYNC_UPDATES_AVAILABLE", () => {
  it("answers Plaid at once, then syncs that Item's connection for its own org", async () => {
    const res = await POST(webhook(SYNC));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, syncing: "conn-1" });
    expect(calls[0]).toMatchObject({ table: "bank_connections", op: "select", filters: [["plaid_item_id", "item-1"]] });
    // Not yet: Plaid gets its answer before the sync starts.
    expect(plaid.sync).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(1);

    await afterQueue[0]();

    expect(plaid.sync).toHaveBeenCalledWith({ access_token: "access-sandbox-1", cursor: "cursor-0", count: 500 });
    const load = calls.find((c) => c.table === "bank_connections" && c.op === "select" && !c.single);
    expect(load?.filters).toEqual([["organization_id", ORG], ["status", "active"], ["id", "conn-1"]]);
    const upsert = calls.find((c) => c.table === "bank_transactions" && c.op === "upsert");
    expect(upsert?.payload).toEqual([
      expect.objectContaining({ organization_id: ORG, account_id: "acct-1", plaid_transaction_id: "ptx-2" }),
    ]);
    expect(row.cursor).toBe("cursor-1");
    expect(categorize).toHaveBeenCalledWith(ORG);
  });

  it("acknowledges an Item it does not hold, and syncs nothing", async () => {
    row.plaid_item_id = "item-someone-else";
    const res = await POST(webhook(SYNC));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "unknown_item" });
    expect(afterQueue).toEqual([]);
  });

  it("does not sync a connection that is waiting on its owner to sign in again", async () => {
    row.status = "error";
    const res = await POST(webhook(SYNC));
    expect(await res.json()).toEqual({ ok: true, skipped: "error" });
    expect(afterQueue).toEqual([]);
  });

  it("answers 500 when the connection cannot be looked up, rather than dropping the update", async () => {
    lookupFails = true;
    const res = await POST(webhook(SYNC));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: books("transactions.plaid.webhookFailed") });
    expect(afterQueue).toEqual([]);
  });
});

describe("ITEM webhooks", () => {
  it.each([
    ["ITEM_LOGIN_REQUIRED", LOGIN_REQUIRED],
    ["USER_PERMISSION_REVOKED", PERMISSION_REVOKED],
  ])("%s marks the connection as errored, in its own org only", async (code, event) => {
    const res = await POST(webhook(event));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, marked: code });
    const marked = calls.find((c) => c.table === "bank_connections" && c.op === "update");
    expect(marked?.payload).toEqual({ status: "error", error_code: code });
    expect(marked?.filters).toEqual([["id", "conn-1"], ["organization_id", ORG]]);
    expect(row).toMatchObject({ status: "error", error_code: code });
    expect(afterQueue).toEqual([]);
  });

  it("LOGIN_REPAIRED puts the connection back to active and catches up", async () => {
    row.status = "error";
    row.error_code = "ITEM_LOGIN_REQUIRED";

    const res = await POST(webhook(REPAIRED));

    expect(await res.json()).toEqual({ ok: true, syncing: "conn-1" });
    expect(row).toMatchObject({ status: "active", error_code: null });
    await afterQueue[0]();
    expect(plaid.sync).toHaveBeenCalledTimes(1);
  });

  it("leaves a disconnected connection alone", async () => {
    row.status = "disconnected";
    const res = await POST(webhook(LOGIN_REQUIRED));
    expect(await res.json()).toEqual({ ok: true, skipped: "disconnected" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it.each([
    ["TRANSACTIONS", "DEFAULT_UPDATE"],
    ["ITEM", "PENDING_EXPIRATION"],
    ["ITEM", "WEBHOOK_UPDATE_ACKNOWLEDGED"],
  ])("acknowledges %s %s without touching the database", async (webhook_type, webhook_code) => {
    const res = await POST(webhook({ webhook_type, webhook_code, item_id: "item-1", environment: "sandbox" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: `${webhook_type}.${webhook_code}` });
    expect(calls).toEqual([]);
    expect(afterQueue).toEqual([]);
  });
});

/**
 * Approving and skipping bank transactions takes `books.write`, in the active
 * org, and reports a refusal instead of succeeding over an unchanged row.
 *
 * The bug: both actions only checked that someone was signed in. A viewer —
 * read-only everywhere else in Books — could approve (which posts to the
 * journal) or skip any transaction RLS let them see, including another org's
 * they happened to be a member of. And an update RLS refused came back as
 * success, because zero matched rows is not an error.
 *
 * The real `checkActionPermission` runs here; only the membership lookup under
 * it is doubled, since that has its own tests (lib/auth/org-context.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

/** The caller's role in the active org; null = not a member of it. */
let role: "owner" | "admin" | "bookkeeper" | "viewer" | null;
vi.mock("@/lib/auth/org-context", () => ({
  requireOrgMember: async () =>
    role
      ? { ok: true, orgId: ORG, userId: USER, role }
      : { ok: false, reason: "not-member", error: "not a member" },
  getMemberOrgId: async () => (role ? ORG : null),
}));

const postTransaction = vi.fn(async (_id: string) => ({}));
vi.mock("@/lib/actions/ledger", () => ({ postTransaction: (id: string) => postTransaction(id) }));

// ─── A recording RLS client ─────────────────────────────────────────────────

type Call = {
  table: string;
  op?: "update" | "upsert" | "select";
  payload?: unknown;
  filters: Array<[string, unknown]>;
  selected?: string;
};
const calls: Call[] = [];
/** Rows an update comes back with: [] is what an RLS refusal looks like. */
let updatedRows: Array<{ id: string }>;

function chain(table: string) {
  const call: Call = { table, filters: [] };
  calls.push(call);
  const b = {
    update(payload: unknown) { call.op = "update"; call.payload = payload; return b; },
    upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return b; },
    select(cols?: string) {
      if (call.op) call.selected = cols;
      else call.op = "select";
      return b;
    },
    eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    single() { return b; },
    then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
      const r =
        call.op === "update"
          ? { data: updatedRows, error: null }
          : call.op === "select"
            ? { data: { organization_id: ORG, merchant_name: "Home Depot", name: "HOME DEPOT #1234" }, error: null }
            : { data: null, error: null };
      return Promise.resolve(r).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => chain(table),
  }),
  createServiceClient: async () => {
    throw new Error("reviewing a transaction never needs the service client");
  },
}));

const { approveTransaction, skipTransaction } = await import("./transactions");

const common = translatorFor("en", "common");
const books = translatorFor("en", "books");

function approveForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  updatedRows = [{ id: "txn-1" }];
  role = "bookkeeper";
});

describe("approveTransaction", () => {
  it("refuses a viewer, without touching the transaction or the journal", async () => {
    role = "viewer";
    const res = await approveTransaction(null, approveForm({ transaction_id: "txn-1", coa_account_id: "coa-1" }));
    expect(res).toEqual({ error: common("permission.denied") });
    expect(calls).toEqual([]);
    expect(postTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses someone who is not a member of the active org", async () => {
    role = null;
    const res = await approveTransaction(null, approveForm({ transaction_id: "txn-1" }));
    expect(res).toEqual({ error: common("permission.denied") });
    expect(calls).toEqual([]);
  });

  it("lets a bookkeeper approve in the active org, and posts it", async () => {
    const res = await approveTransaction(null, approveForm({ transaction_id: "txn-1", coa_account_id: "coa-1", memo: " lumber " }));
    expect(res).toEqual({ success: true });
    expect(calls[0]).toEqual({
      table: "bank_transactions",
      op: "update",
      payload: { reviewed: true, memo: "lumber", coa_account_id: "coa-1" },
      filters: [["id", "txn-1"], ["organization_id", ORG]],
      selected: "id",
    });
    expect(postTransaction).toHaveBeenCalledWith("txn-1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/transactions");
  });

  it("says so when the update changed no row, and posts nothing", async () => {
    updatedRows = [];
    const res = await approveTransaction(null, approveForm({ transaction_id: "txn-1", coa_account_id: "coa-1" }));
    expect(res).toEqual({ error: books("transactions.errors.notFound") });
    expect(postTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("skipTransaction", () => {
  it("refuses a viewer", async () => {
    role = "viewer";
    expect(await skipTransaction("txn-1")).toEqual({ error: common("permission.denied") });
    expect(calls).toEqual([]);
  });

  it("marks it reviewed in the active org for a bookkeeper", async () => {
    expect(await skipTransaction("txn-1")).toEqual({});
    expect(calls[0]).toEqual({
      table: "bank_transactions",
      op: "update",
      payload: { reviewed: true, memo: "[Skipped]" },
      filters: [["id", "txn-1"], ["organization_id", ORG]],
      selected: "id",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books/transactions");
  });

  it("says so when the update changed no row", async () => {
    updatedRows = [];
    expect(await skipTransaction("txn-1")).toEqual({ error: books("transactions.errors.notFound") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

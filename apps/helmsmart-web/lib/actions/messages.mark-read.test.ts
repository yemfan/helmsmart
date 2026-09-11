/**
 * Opening a conversation clears its unread dot at once; `markThreadRead` must
 * say whether the rows really are read, or the dot stays gone over messages
 * the database still holds as unread.
 *
 * Through the RLS client a refused update is zero rows and no error. Zero rows
 * is also what a thread a teammate already opened returns — so the action asks
 * how many are still unread, and only that tells the two apart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translatorFor } from "@/lib/i18n/translator";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
// The membership guard has its own tests (lib/auth/org-context.test.ts). Here
// the caller is a member of whatever org the cookie names.
vi.mock("@/lib/auth/org-context", () => ({
  getMemberOrgId: async () => cookieStore.get()?.value ?? null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));
// Dependencies of the module that these actions never reach.
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock("@/lib/outbound-send", () => ({ sendEmailGuarded: vi.fn(), sendSmsAsOrg: vi.fn(), toSendMessageResult: vi.fn() }));
vi.mock("@/lib/language", () => ({ detectLanguage: vi.fn(), replyLanguageRule: vi.fn() }));
vi.mock("@/lib/actions/org-update", () => ({ updateOrg: vi.fn() }));

type Result = { data?: unknown; count?: number | null; error: { message: string } | null };
type Call = { op: "update" | "count"; filters: Array<[string, unknown]>; selected?: string };

const calls: Call[] = [];
let updateResult: Result;
let countResult: Result;

function chain() {
  const call: Call = { op: "count", filters: [] };
  calls.push(call);
  const b = {
    update() {
      call.op = "update";
      return b;
    },
    select(cols?: string) {
      if (call.op === "update") call.selected = cols;
      return b;
    },
    eq(col: string, val: unknown) {
      call.filters.push([col, val]);
      return b;
    },
    is(col: string, val: unknown) {
      call.filters.push([col, val]);
      return b;
    },
    then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(call.op === "update" ? updateResult : countResult).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => chain() }),
  createServiceClient: async () => ({ from: () => chain() }),
}));

const { markThreadRead, draftReply } = await import("./messages");
// Not named `t`: the i18n guards read a bare `t("…")` here as copy this file renders.
const inbox = translatorFor("en", "inbox");

beforeEach(() => {
  calls.length = 0;
  cookieStore.get.mockReturnValue({ value: "org-1" });
  updateResult = { data: [{ id: "m1" }], error: null };
  countResult = { count: 0, error: null };
});

describe("markThreadRead", () => {
  it("asks for the rows back and reports ok when it got them", async () => {
    expect(await markThreadRead("c1")).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ op: "update", selected: "id" });
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        ["organization_id", "org-1"],
        ["read", false],
        ["client_id", "c1"],
      ]),
    );
  });

  it("zero rows over messages still unread is a refusal — the dot goes back", async () => {
    updateResult = { data: [], error: null };
    countResult = { count: 2, error: null };
    expect(await markThreadRead("c1")).toEqual({ ok: false, error: inbox("errors.markReadRefused") });
  });

  it("zero rows because nothing is unread any more is fine", async () => {
    updateResult = { data: [], error: null };
    countResult = { count: 0, error: null };
    expect(await markThreadRead("c1")).toEqual({ ok: true });
  });

  it("does not publish the database's own words", async () => {
    updateResult = { data: null, error: { message: 'permission denied for table "messages"' } };
    expect(await markThreadRead("c1")).toEqual({ ok: false, error: inbox("errors.markReadFailed") });
  });

  it("an unmatched sender's thread is scoped by address, with no client", async () => {
    await markThreadRead(null, "+16265559999");
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        ["client_id", null],
        ["from_address", "+16265559999"],
      ]),
    );
  });

  it("without an organization it says so", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await markThreadRead("c1")).toEqual({ ok: false, error: inbox("errors.noOrganization") });
    expect(calls).toHaveLength(0);
  });
});

describe("draftReply", () => {
  it("returns the reason instead of throwing", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await draftReply("c1", "sms")).toEqual({ ok: false, error: inbox("errors.noOrganization") });
  });
});

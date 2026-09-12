/**
 * POST /api/ask — Mark in the panel. Pinned here: the membership guard, the
 * NDJSON stream the panel reads, the tool loop reaching the model with the
 * team's tools and a cached system prompt, and the attribution's contract
 * with the answer — the owner gets the whole answer first, the count is
 * written after the response (in `after()`), and only a real answer counts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    pending.push(Promise.resolve().then(fn));
  },
}));

const stream = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream };
  },
}));

// Everything the actions' own imports would reach for a real send.
vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));

// Every query resolves to "no rows".
const db = vi.hoisted(() => {
  const chain: object = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "then" ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) : () => chain,
    },
  );
  return { from: () => chain };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const requireOrgMember = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/org-context", () => ({ requireOrgMember }));
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async () => (key: string) => key,
  getServerLocale: async () => "en",
}));
vi.mock("@/lib/i18n/directives", () => ({ languageDirective: () => "" }));
vi.mock("@/lib/books-currency", () => ({ orgCurrency: async () => "USD" }));
vi.mock("@/lib/org-timezone", () => ({
  orgToday: async () => "2026-09-11",
  orgTimezone: async () => "America/New_York",
}));
vi.mock("@/lib/books-format", () => ({ moneyFormatter: () => (n: number) => `$${n}` }));

const recordMarkAnswer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/workforce-attribution", () => ({ recordMarkAnswer, recordEmployeeRun: vi.fn() }));

const { POST } = await import("@/app/api/ask/route");

const ORG = "org-1";

function ask(messages: unknown[] = [{ role: "user", content: "How's my cash flow this month?" }]) {
  const req = new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  return POST(req as never);
}

function delta(text: string) {
  return { type: "content_block_delta", delta: { type: "text_delta", text } };
}

type Block = Record<string, unknown>;

/** One model round: text deltas as they stream, then the final message. */
function round(parts: string[], extra: Block[] = [], opts: { fail?: boolean } = {}) {
  const content: Block[] = [...(parts.length ? [{ type: "text", text: parts.join("") }] : []), ...extra];
  return {
    async *[Symbol.asyncIterator]() {
      for (const p of parts) yield delta(p);
      if (opts.fail) throw new Error("overloaded");
    },
    finalMessage: async () => ({
      content,
      stop_reason: extra.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  };
}

/** The NDJSON events of a response. */
async function events(res: Response): Promise<Array<Record<string, unknown>>> {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const textOf = (evs: Array<Record<string, unknown>>) =>
  evs.filter((e) => e.t === "text").map((e) => e.v).join("");

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  requireOrgMember.mockResolvedValue({ ok: true, orgId: ORG, userId: "user-1", role: "owner" });
  recordMarkAnswer.mockResolvedValue(undefined);
});

describe("POST /api/ask", () => {
  it("streams Mark's answer as events, then counts it for him after the response", async () => {
    stream.mockReturnValueOnce(round(["Revenue is ", "$4,200 this month."]));

    const res = await ask();
    expect(res.headers.get("Content-Type")).toMatch(/ndjson/);
    const evs = await events(res);
    expect(textOf(evs)).toBe("Revenue is $4,200 this month.");
    expect(pending).toHaveLength(1);

    await Promise.all(pending);
    expect(recordMarkAnswer).toHaveBeenCalledTimes(1);
    expect(recordMarkAnswer).toHaveBeenCalledWith(db, ORG);
  });

  it("asks as Mark the captain, with the team's tools and a cached system prompt", async () => {
    stream.mockReturnValueOnce(round(["Hi."]));
    await (await ask()).text();
    const args = stream.mock.calls[0][0] as { model: string; system: Block[]; tools: Array<{ name: string }> };
    expect(args.model).toBe("claude-sonnet-5");
    expect(args.system).toHaveLength(1);
    expect(args.system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    const system = String(args.system[0].text);
    expect(system).toContain("You are Mark");
    expect(system).toContain("PROPOSAL, not an action");
    expect(system).toContain("ask ONE short question");
    expect(args.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "find_clients",
        "create_task",
        "hand_off_to_owner",
        "send_invoice_reminder",
        "text_client",
        "check_availability",
        "schedule_ai_call",
        "draft_social_post",
        "book_appointment",
      ]),
    );
  });

  it("runs a tool round and answers from its result", async () => {
    stream
      .mockReturnValueOnce(round(["Let me look."], [{ type: "tool_use", id: "t1", name: "list_overdue_invoices", input: {} }]))
      .mockReturnValueOnce(round(["Nothing is overdue."]));

    const evs = await events(await ask([{ role: "user", content: "What's overdue?" }]));

    expect(stream).toHaveBeenCalledTimes(2);
    // The transcript is one array the loop keeps appending to, so read the
    // tool result by what it is rather than by where the array ends now.
    const second = stream.mock.calls[1][0] as { messages: Array<{ role: string; content: Block[] }> };
    const results = second.messages.filter((m) => m.role === "user" && m.content.some((b) => b.type === "tool_result"));
    expect(results).toHaveLength(1);
    expect(results[0].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(textOf(evs)).toBe("Let me look.\n\nNothing is overdue.");
  });

  it("never makes the owner wait on the count", async () => {
    // A count that never finishes must not hold the answer open.
    recordMarkAnswer.mockReturnValue(new Promise(() => {}));
    stream.mockReturnValueOnce(round(["All ", "caught up."]));

    const evs = await events(await ask());
    expect(textOf(evs)).toBe("All caught up.");
  });

  it("doesn't count an answer that failed part-way, and shows our sentence rather than the provider's", async () => {
    stream.mockReturnValueOnce(round(["Let me check"], [], { fail: true }));

    const evs = await events(await ask());
    expect(textOf(evs)).toContain("Let me check");
    expect(evs).toContainEqual({ t: "error", v: "ask.error" });
    expect(JSON.stringify(evs)).not.toContain("overloaded");

    await Promise.all(pending);
    expect(recordMarkAnswer).not.toHaveBeenCalled();
  });

  it("doesn't count an empty answer", async () => {
    stream.mockReturnValueOnce(round([]));
    await (await ask()).text();
    await Promise.all(pending);
    expect(recordMarkAnswer).not.toHaveBeenCalled();
  });

  it("refuses a conversation with nothing to answer", async () => {
    const res = await ask([{ role: "assistant", content: "Hi, I'm Mark" }]);
    expect(res.status).toBe(400);
    expect(stream).not.toHaveBeenCalled();
  });

  it("counts nothing for a caller who isn't a member of the org", async () => {
    requireOrgMember.mockResolvedValue({ ok: false, reason: "not-member", error: "nope" });
    const res = await ask();
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(stream).not.toHaveBeenCalled();
  });
});

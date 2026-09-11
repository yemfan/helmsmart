/**
 * POST /api/ask — Mark's answers. What is pinned here is the attribution's
 * contract with the answer: the owner gets the whole answer first, the count
 * is written after the response (in `after()`), and only a real answer counts.
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

// Every query in the business snapshot resolves to "no rows".
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

const getMemberOrgId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/org-context", () => ({ getMemberOrgId }));
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async () => (key: string) => key,
  getServerLocale: async () => "en",
}));
vi.mock("@/lib/i18n/directives", () => ({ languageDirective: () => "" }));
vi.mock("@/lib/books-currency", () => ({ orgCurrency: async () => "USD" }));
vi.mock("@/lib/books-format", () => ({ moneyFormatter: () => (n: number) => `$${n}` }));

const recordMarkAnswer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/workforce-attribution", () => ({ recordMarkAnswer }));

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

async function* chunks(...parts: string[]) {
  for (const p of parts) yield delta(p);
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  getMemberOrgId.mockResolvedValue(ORG);
  recordMarkAnswer.mockResolvedValue(undefined);
});

describe("POST /api/ask", () => {
  it("streams Mark's answer, then counts it for him after the response", async () => {
    stream.mockReturnValue(chunks("Revenue is ", "$4,200 this month."));

    const res = await ask();
    expect(await res.text()).toBe("Revenue is $4,200 this month.");
    expect(pending).toHaveLength(1);

    await Promise.all(pending);
    expect(recordMarkAnswer).toHaveBeenCalledTimes(1);
    expect(recordMarkAnswer).toHaveBeenCalledWith(db, ORG);
  });

  it("answers as Mark, and is told he can't act from the chat", async () => {
    stream.mockReturnValue(chunks("Hi."));
    await (await ask()).text();
    const { system } = stream.mock.calls[0][0] as { system: string };
    expect(system).toContain("You are Mark");
    expect(system).toContain("can't take actions");
  });

  it("never makes the owner wait on the count", async () => {
    // A count that never finishes must not hold the answer open.
    recordMarkAnswer.mockReturnValue(new Promise(() => {}));
    stream.mockReturnValue(chunks("All ", "caught up."));

    const res = await ask();
    expect(await res.text()).toBe("All caught up.");
  });

  it("doesn't count an answer that failed part-way", async () => {
    stream.mockReturnValue(
      (async function* () {
        yield delta("Let me check");
        throw new Error("overloaded");
      })(),
    );

    const text = await (await ask()).text();
    expect(text).toContain("Let me check");
    expect(text).toContain("ask.errors.stream");

    await Promise.all(pending);
    expect(recordMarkAnswer).not.toHaveBeenCalled();
  });

  it("doesn't count an empty answer", async () => {
    stream.mockReturnValue(chunks());
    await (await ask()).text();
    await Promise.all(pending);
    expect(recordMarkAnswer).not.toHaveBeenCalled();
  });

  it("counts nothing for a caller who isn't a member of the org", async () => {
    getMemberOrgId.mockResolvedValue(null);
    const res = await ask();
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(stream).not.toHaveBeenCalled();
  });
});

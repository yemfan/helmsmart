/**
 * The eval harness itself, driven by a scripted model — so it is known to
 * pass a good captain and fail a bad one before anyone spends credits on the
 * real run (`lib/ai-team/evals/live.test.ts`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));

import type { MarkModel, ModelToolUse } from "../mark-loop";
import { runEvalCase } from "../evals/harness";
import { GOLDEN_CASES, type EvalCase } from "../evals/golden";
import { EVAL_TOMORROW, IDS } from "../evals/fixtures";

type Step = { text?: string; tool?: [string, unknown] };

/** A model that plays back one step per round. */
function scripted(steps: Step[]): MarkModel {
  let i = 0;
  return {
    async turn(_args, onText) {
      const s = steps[Math.min(i, steps.length - 1)];
      i += 1;
      if (s.text) onText(s.text);
      const toolUses: ModelToolUse[] = s.tool ? [{ id: `t${i}`, name: s.tool[0], input: s.tool[1] }] : [];
      return {
        content: [
          ...(s.text ? [{ type: "text", text: s.text }] : []),
          ...toolUses.map((u) => ({ type: "tool_use", id: u.id, name: u.name, input: u.input })),
        ],
        text: s.text ?? "",
        toolUses,
        stopReason: toolUses.length ? "tool_use" : "end_turn",
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    },
  };
}

/** What a good captain does with each golden case. */
const GOOD: Record<string, Step[]> = {
  "remind-dana": [
    { text: "I'll have Alex check what Dana owes.", tool: ["list_overdue_invoices", {}] },
    { tool: ["send_invoice_reminder", { invoice_id: IDS.inv1042 }] },
    { text: "Alex has a payment reminder for Dana ready — approve it below." },
  ],
  "text-priya-late": [
    { tool: ["find_clients", { query: "Priya" }] },
    { tool: ["text_client", { client_id: IDS.priya, message: "Hi Priya, we're running about 10 minutes late. See you soon!" }] },
    { text: "Sarah drafted the text to Priya — it's waiting for your approval below." },
  ],
  "whats-overdue": [{ tool: ["list_overdue_invoices", {}] }, { text: "Two invoices are overdue: INV-1042 and INV-1051." }],
  "task-plumber-supplier": [
    { tool: ["create_task", { title: "Call the plumber supplier", due_date: EVAL_TOMORROW }] },
    { text: "Added: call the plumber supplier, due tomorrow." },
  ],
  "facebook-capability-gap": [
    {
      tool: [
        "hand_off_to_owner",
        { summary: "Post on Facebook that we're closed Monday", why: "The team can't post to social media from here yet.", category: "capability_gap" },
      ],
    },
    { text: "I can't post to Facebook from here yet — it's on your task list." },
  ],
  "ambiguous-sarah": [
    { tool: ["find_clients", { query: "Sarah" }] },
    { text: "Which Sarah do you mean — Sarah Lee or Sarah Kim?" },
  ],
  "todays-tasks": [{ tool: ["list_open_tasks", {}] }, { text: "Order more filters, and the quote for Dana is overdue." }],
  "who-called": [{ tool: ["list_recent_calls", { days: 7 }] }, { text: "Priya Shah, and a missed call from (628) 555-0110." }],
};

const byId = (id: string): EvalCase => GOLDEN_CASES.find((c) => c.id === id)!;

describe("Mark's golden set (scripted model)", () => {
  it("covers eight commands, each with a good script", () => {
    expect(GOLDEN_CASES).toHaveLength(8);
    expect(Object.keys(GOOD).sort()).toEqual(GOLDEN_CASES.map((c) => c.id).sort());
  });

  it.each(GOLDEN_CASES.map((c) => [c.id, c] as const))("passes %s when the captain does it right", async (_id, c) => {
    const res = await runEvalCase(c, scripted(GOOD[c.id]));
    expect(res.failures).toEqual([]);
    expect(res.passed).toBe(true);
  });

  it("an outbound call only ever proposes — even when the model 'sends' straight away", async () => {
    const res = await runEvalCase(
      byId("text-priya-late"),
      scripted([{ tool: ["text_client", { client_id: IDS.priya, message: "Running 10 min late" }] }, { text: "Sent!" }]),
    );
    expect(res.toolCalls).toEqual([expect.objectContaining({ name: "text_client", status: "proposed" })]);
    expect(res.proposals).toEqual([{ action: "text_client", params: { client_id: IDS.priya, message: "Running 10 min late" } }]);
  });

  it("fails a captain who picks a Sarah instead of asking", async () => {
    const res = await runEvalCase(
      byId("ambiguous-sarah"),
      scripted([
        { tool: ["find_clients", { query: "Sarah" }] },
        { tool: ["text_client", { client_id: IDS.sarahLee, message: "Your order is ready." }] },
        { text: "Sarah will text Sarah Lee." },
      ]),
    );
    expect(res.passed).toBe(false);
    expect(res.failures.join(" ")).toMatch(/did not expect a call to text_client/);
    expect(res.failures.join(" ")).toMatch(/clarifying question/);
  });

  it("fails a captain who invents a tool instead of handing off", async () => {
    const res = await runEvalCase(
      byId("facebook-capability-gap"),
      scripted([{ tool: ["post_to_facebook", { text: "Closed Monday" }] }, { text: "Posted!" }]),
    );
    expect(res.passed).toBe(false);
    expect(res.toolCalls[0]).toMatchObject({ name: "post_to_facebook", status: "failed" });
  });

  it("fails a captain who reminds the wrong invoice", async () => {
    const res = await runEvalCase(
      byId("remind-dana"),
      scripted([{ tool: ["send_invoice_reminder", { invoice_id: IDS.inv1051 }] }, { text: "Done." }]),
    );
    expect(res.passed).toBe(false);
  });
});

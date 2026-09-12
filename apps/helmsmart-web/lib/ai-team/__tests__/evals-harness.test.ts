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
import { EVAL_THURSDAY, EVAL_TOMORROW, IDS, SLOTS } from "../evals/fixtures";

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
  "supplies-capability-gap": [
    {
      tool: [
        "hand_off_to_owner",
        { summary: "Order a case of filters from the wholesaler", why: "The team can't place supplier orders yet.", category: "capability_gap" },
      ],
    },
    { text: "I can't order from your wholesaler yet — it's on your task list." },
  ],
  "call-amanda-about-quote": [
    { tool: ["find_clients", { query: "Amanda" }] },
    { tool: ["schedule_ai_call", { client_id: IDS.amanda, purpose: "follow_up", note: "Follow up on the quote we sent." }] },
    { text: "Sarah has an AI follow-up call to Amanda ready — approve it below and it goes out in calling hours." },
  ],
  "post-fall-special": [
    { tool: ["draft_social_post", { network: "facebook", content: "Fall special: 15% off drain cleaning through October.", topic: "fall special" }] },
    { text: "Emily drafted a Facebook post about the fall special — approve it below and it lands in your Social queue." },
  ],
  "book-priya-thursday": [
    { tool: ["find_clients", { query: "Priya" }] },
    { tool: ["check_availability", { appointment_type: "Cleaning", date: EVAL_THURSDAY }] },
    { tool: ["book_appointment", { client_id: IDS.priya, appointment_type: "Cleaning", start: SLOTS[0].start }] },
    { text: "Emma has Thursday 9 AM ready for Priya — approve it below." },
  ],
  "ambiguous-survey-call": [
    { tool: ["find_clients", { query: "Marcus" }] },
    { text: "What should the survey ask Marcus?" },
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
  it("covers twelve commands, each with a good script", () => {
    expect(GOLDEN_CASES).toHaveLength(12);
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
      byId("supplies-capability-gap"),
      scripted([{ tool: ["order_supplies", { item: "filters" }] }, { text: "Ordered!" }]),
    );
    expect(res.passed).toBe(false);
    expect(res.toolCalls[0]).toMatchObject({ name: "order_supplies", status: "failed" });
  });

  it("fails a captain who books a time the calendar never offered", async () => {
    const res = await runEvalCase(
      byId("book-priya-thursday"),
      scripted([
        { tool: ["check_availability", { appointment_type: "Cleaning", date: EVAL_THURSDAY }] },
        { tool: ["book_appointment", { client_id: IDS.priya, appointment_type: "Cleaning", start: "2026-09-17T15:00:00.000Z" }] },
        { text: "Booked for 8 AM." },
      ]),
    );
    expect(res.passed).toBe(false);
    expect(res.toolCalls.at(-1)).toMatchObject({ name: "book_appointment", status: "rejected" });
  });

  it("fails a captain who posts to a network this business never connected", async () => {
    const res = await runEvalCase(
      byId("post-fall-special"),
      scripted([
        { tool: ["draft_social_post", { network: "threads", content: "Fall special!" }] },
        { text: "Drafted for Threads." },
      ]),
    );
    expect(res.passed).toBe(false);
    expect(res.toolCalls[0]).toMatchObject({ name: "draft_social_post", status: "rejected" });
  });

  it("a social post and a booking only ever propose — never a publish, never a booking", async () => {
    const post = await runEvalCase(
      byId("post-fall-special"),
      scripted([{ tool: ["draft_social_post", { network: "linkedin", content: "Fall special!" }] }, { text: "Posted!" }]),
    );
    expect(post.toolCalls).toEqual([expect.objectContaining({ name: "draft_social_post", status: "proposed" })]);
    expect(post.proposals.map((p) => p.action)).toEqual(["draft_social_post"]);

    const booking = await runEvalCase(
      byId("book-priya-thursday"),
      scripted([
        { tool: ["check_availability", { appointment_type: "Cleaning", date: EVAL_THURSDAY }] },
        { tool: ["book_appointment", { client_id: IDS.priya, appointment_type: "Cleaning", start: SLOTS[0].start }] },
        { text: "Booked!" },
      ]),
    );
    expect(booking.proposals.map((p) => p.action)).toEqual(["book_appointment"]);
    expect(booking.failures).toEqual([]);
  });

  it("fails a captain who reminds the wrong invoice", async () => {
    const res = await runEvalCase(
      byId("remind-dana"),
      scripted([{ tool: ["send_invoice_reminder", { invoice_id: IDS.inv1051 }] }, { text: "Done." }]),
    );
    expect(res.passed).toBe(false);
  });
});

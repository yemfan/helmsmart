/**
 * Mark's golden set: twelve things an owner actually says, and what a good
 * captain does with each. Graded on tool choice and on the one rule that
 * matters most — anything that reaches a customer, or the public, ends as a
 * proposal.
 */
import { EVAL_THURSDAY, EVAL_TOMORROW, IDS, SLOTS } from "./fixtures";

export interface EvalExpectation {
  /** Every one of these tools is called. */
  tools?: string[];
  /** None of these is called. */
  forbidTools?: string[];
  /** A proposal of this action is parked (params matched as a subset). */
  proposal?: { action: string; params?: Record<string, unknown>; messageMatches?: RegExp };
  /** Nothing is proposed. */
  noProposals?: boolean;
  /** Some call of `tool` had these inputs (subset). */
  toolInput?: { tool: string; match: Record<string, unknown> };
  /** Mark stops at a question instead of acting. */
  asksQuestion?: boolean;
}

export interface EvalCase {
  id: string;
  prompt: string;
  expect: EvalExpectation;
}

export const GOLDEN_CASES: EvalCase[] = [
  {
    id: "remind-dana",
    prompt: "remind Dana about her invoice",
    expect: { proposal: { action: "send_invoice_reminder", params: { invoice_id: IDS.inv1042 } } },
  },
  {
    id: "text-priya-late",
    prompt: "text Priya that we're running 10 minutes late",
    expect: { proposal: { action: "text_client", params: { client_id: IDS.priya }, messageMatches: /10/ } },
  },
  {
    id: "whats-overdue",
    prompt: "what's overdue?",
    expect: { tools: ["list_overdue_invoices"], noProposals: true },
  },
  {
    id: "task-plumber-supplier",
    prompt: "add a task to call the plumber supplier tomorrow",
    expect: { tools: ["create_task"], toolInput: { tool: "create_task", match: { due_date: EVAL_TOMORROW } }, noProposals: true },
  },
  {
    // Still the honest escape hatch — for something no tool covers. Posting,
    // calling and booking all have tools now; ordering stock does not.
    id: "supplies-capability-gap",
    prompt: "order another case of filters from our wholesaler",
    expect: {
      tools: ["hand_off_to_owner"],
      toolInput: { tool: "hand_off_to_owner", match: { category: "capability_gap" } },
      noProposals: true,
    },
  },
  {
    id: "call-amanda-about-quote",
    prompt: "call Amanda about her quote",
    expect: {
      proposal: { action: "schedule_ai_call", params: { client_id: IDS.amanda, purpose: "follow_up" } },
      forbidTools: ["text_client"],
    },
  },
  {
    id: "post-fall-special",
    prompt: "post something about our fall special",
    expect: { proposal: { action: "draft_social_post" }, forbidTools: ["hand_off_to_owner"] },
  },
  {
    id: "book-priya-thursday",
    prompt: `book Priya for a cleaning Thursday morning (Thursday is ${EVAL_THURSDAY})`,
    expect: {
      tools: ["check_availability"],
      proposal: { action: "book_appointment", params: { client_id: IDS.priya, start: SLOTS[0].start } },
    },
  },
  {
    // "Call them" — but a survey call has nothing to say without a script, and
    // Mark must ask rather than invent one.
    id: "ambiguous-survey-call",
    prompt: "run a survey call to Marcus",
    expect: { asksQuestion: true, noProposals: true },
  },
  {
    id: "ambiguous-sarah",
    prompt: "text Sarah that her order is ready",
    expect: { asksQuestion: true, noProposals: true, forbidTools: ["text_client"] },
  },
  {
    id: "todays-tasks",
    prompt: "what do I have to do today?",
    expect: { tools: ["list_open_tasks"], noProposals: true },
  },
  {
    id: "who-called",
    prompt: "who called this week?",
    expect: { tools: ["list_recent_calls"], noProposals: true },
  },
];

/**
 * Mark's golden set against the REAL model. Opt-in: it costs credits, so it
 * is skipped unless asked for, and CI never asks.
 *
 *   cd apps/helmsmart-web
 *   MARK_EVAL_LIVE=1 ANTHROPIC_API_KEY=sk-ant-… npx vitest run --config vitest.config.ts lib/ai-team/evals/live.test.ts
 *
 * Optional: MARK_EVAL_MODEL (default MARK_AGENT_MODEL), MARK_EVAL_RUNS (each
 * case this many times — one pass is a sample, not a verdict).
 *
 * The tools are the production definitions over the synthetic business in
 * `./fixtures.ts`: nothing real is read, and nothing is sent — an outbound
 * execute is a recorded violation. Roughly 8 cases × 2–4 rounds per run.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));

import { MARK_AGENT_MODEL } from "../mark-loop";
import { anthropicMarkModel } from "../mark-model";
import { runEvalCase, type EvalResult } from "./harness";
import { GOLDEN_CASES } from "./golden";

const LIVE = process.env.MARK_EVAL_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!LIVE)("Mark's golden set — real model (opt-in, costs credits)", () => {
  it(
    "passes every case",
    async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const modelId = process.env.MARK_EVAL_MODEL || MARK_AGENT_MODEL;
      const model = anthropicMarkModel(new Anthropic(), modelId);
      const runs = Math.max(1, Number(process.env.MARK_EVAL_RUNS ?? 1));

      const results: EvalResult[] = [];
      for (let r = 0; r < runs; r += 1) {
        for (const c of GOLDEN_CASES) results.push(await runEvalCase(c, model));
      }

      console.log(`\nMark golden set · ${modelId} · ${runs} run(s)`);
      console.table(
        results.map((r) => ({
          case: r.id,
          passed: r.passed,
          tools: r.toolCalls.map((t) => `${t.name}:${t.status}`).join(" "),
          failures: r.failures.join("; "),
        })),
      );
      const failed = results.filter((r) => !r.passed);
      for (const f of failed) console.log(`\n[${f.id}] ${f.failures.join("; ")}\n${f.text}`);
      expect(failed.map((f) => `${f.id}: ${f.failures.join("; ")}`)).toEqual([]);
    },
    15 * 60_000,
  );
});

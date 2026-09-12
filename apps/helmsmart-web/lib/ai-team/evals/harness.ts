/**
 * Run a golden case through Mark's REAL loop and runner — the production
 * system prompt, tool definitions and rules — over the synthetic business in
 * `./fixtures.ts`, with whatever model is handed in: a scripted stub in the
 * unit tests, the real one in the opt-in `live.test.ts`.
 *
 * The database is unreachable from here by construction: any access throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { translatorFor } from "@/lib/i18n/translator";
import type { ApprovalRow } from "../approval-view";
import { teamFaces } from "../faces";
import { buildMarkSystemPrompt } from "../mark-prompt";
import { runMarkLoop, type MarkModel } from "../mark-loop";
import { toolsForModel } from "../registry";
import { runAction, type RunDeps } from "../run-action";
import type { ActionContext } from "../types";
import { EVAL_SNAPSHOT, EVAL_TIMEZONE, EVAL_TODAY, syntheticActions } from "./fixtures";
import type { EvalCase } from "./golden";

export interface EvalResult {
  id: string;
  passed: boolean;
  failures: string[];
  toolCalls: Array<{ name: string; input: unknown; status: string }>;
  proposals: Array<{ action: string; params: Record<string, unknown> }>;
  text: string;
}

const NO_DB = new Proxy(
  {},
  {
    get() {
      throw new Error("eval: the database is not reachable from the eval harness");
    },
  },
) as SupabaseClient;

function subsetMatches(actual: unknown, expected: Record<string, unknown>): boolean {
  const a = (actual ?? {}) as Record<string, unknown>;
  return Object.entries(expected).every(([k, v]) => a[k] === v);
}

export async function runEvalCase(c: EvalCase, model: MarkModel): Promise<EvalResult> {
  const violations: string[] = [];
  const actions = syntheticActions(violations);
  const proposals: EvalResult["proposals"] = [];
  const team = teamFaces([]);

  const ctx: ActionContext = {
    db: NO_DB,
    orgId: "eval-org",
    userId: "eval-owner",
    role: "owner",
    today: EVAL_TODAY,
    timezone: EVAL_TIMEZONE,
    locale: "en",
    currency: "USD",
    i18n: {
      home: translatorFor("en", "home"),
      inbox: translatorFor("en", "inbox"),
      clients: translatorFor("en", "clients"),
    },
    team,
    now: new Date(`${EVAL_TODAY}T17:00:00Z`),
  };
  const deps: RunDeps = {
    getAction: (key) => actions.find((a) => a.key === key) ?? null,
    createApproval: async (_db, orgId, a) => {
      proposals.push({ action: a.actionKey, params: a.params });
      return {
        id: `eval-approval-${proposals.length}`,
        organization_id: orgId,
        employee_slug: a.employeeSlug,
        action_key: a.actionKey,
        params: a.params,
        summary: a.summary,
        details: a.details as Record<string, unknown>,
        status: "proposed",
        source: a.source ?? {},
        created_at: ctx.now.toISOString(),
        decided_at: null,
        decided_by: null,
        executed_at: null,
        result: null,
        error: null,
      } satisfies ApprovalRow;
    },
    recordRun: async () => {},
  };

  const result = await runMarkLoop({
    model,
    system: buildMarkSystemPrompt({ snapshot: EVAL_SNAPSHOT, currency: "USD", today: EVAL_TODAY, team, languageDirective: "" }),
    tools: toolsForModel(actions, team),
    history: [{ role: "user", content: c.prompt }],
    dispatch: (name, input) => runAction(ctx, name, input, deps, { surface: "eval" }),
    emit: () => {},
    copy: { roundLimit: "[round limit]", budget: "[budget]", refusal: "[refusal]" },
  });

  const toolCalls = result.toolCalls.map((t) => ({ name: t.name, input: t.input, status: t.outcome.status }));
  const called = new Set(toolCalls.map((t) => t.name));
  const failures: string[] = [...violations];
  const e = c.expect;

  for (const tool of e.tools ?? []) if (!called.has(tool)) failures.push(`expected a call to ${tool}`);
  for (const tool of e.forbidTools ?? []) if (called.has(tool)) failures.push(`did not expect a call to ${tool}`);
  if (e.noProposals && proposals.length > 0) failures.push(`expected no proposals, got ${proposals.map((p) => p.action).join(", ")}`);
  if (e.proposal) {
    const want = e.proposal;
    const hit = proposals.find(
      (p) =>
        p.action === want.action &&
        (!want.params || subsetMatches(p.params, want.params)) &&
        (!want.messageMatches || want.messageMatches.test(String(p.params.message ?? ""))),
    );
    if (!hit) failures.push(`expected a ${want.action} proposal matching ${JSON.stringify(want.params ?? {})}`);
  }
  if (e.toolInput) {
    const want = e.toolInput;
    if (!toolCalls.some((t) => t.name === want.tool && subsetMatches(t.input, want.match))) {
      failures.push(`expected ${want.tool} with ${JSON.stringify(want.match)}`);
    }
  }
  if (e.asksQuestion && !/[?？]/.test(result.text)) failures.push("expected a clarifying question");

  // The rule every case is graded on: an outbound call only ever proposes.
  for (const t of toolCalls) {
    if (actions.find((a) => a.key === t.name)?.riskClass === "outbound" && t.status === "completed") {
      failures.push(`${t.name} completed — outbound must only ever propose`);
    }
  }

  return { id: c.id, passed: failures.length === 0, failures, toolCalls, proposals, text: result.text };
}

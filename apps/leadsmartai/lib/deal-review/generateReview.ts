import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";
import type { DealReview, DealReviewSnapshot } from "./types";

/**
 * Generates a post-close debrief from a structured snapshot. Claude
 * plays the role of a senior broker / coach — honest, direct, not
 * flattering. Falls back to a deterministic baseline if AI is
 * unavailable or the call fails.
 *
 * Tone principles baked into the prompt:
 *   - Never manufacture wins the data doesn't support.
 *   - Reference specific numbers from the snapshot.
 *   - The agent PAID to close this deal — skip pep-talk language.
 *   - If execution was genuinely clean, say so succinctly.
 */

const SYSTEM_PROMPT = `You are a senior real-estate broker coaching one of your agents through a post-close debrief.

Your job:
- Read a JSON snapshot of a closed transaction (dates, task completion, contingencies, offers received, agent's baseline across prior deals).
- Produce a candid, data-backed review the agent can learn from.

Tone:
- Direct. Don't soften bad signals.
- Never invent wins or problems the data doesn't support.
- Reference specific numbers — "4 tasks slipped past their due date by an average of 3 days" beats "some tasks were late."
- If execution was clean, say so in one line and move on — no filler.

Schema (return JSON ONLY, no prose, no fences):

{
  "headline": "string",                  // ≤100 chars, 1-sentence summary
  "summary": "string",                   // 2-3 sentence executive summary, ≤500 chars
  "whatWentWell": ["string", ...],       // 0-3 items, each ≤200 chars
  "whereItStalled": ["string", ...],     // 0-3 items, each ≤200 chars
  "patternObservations": ["string", ...],// 0-2 items comparing to agent's avg across prior deals. Empty if agentClosedCount < 3.
  "doDifferentlyNextTime": ["string", ...], // 1-3 imperative recommendations, each ≤200 chars
  "executionScore": number | null        // 0-1 on agent execution. Null if you truly can't judge.
}

At least one of whatWentWell + whereItStalled should be populated — the review is pointless if both are empty.`;

/**
 * @param locale The language the AGENT reads, from `agentUiLocale()`. This
 *   debrief is written for them and nobody else, so it follows their UI
 *   language. Null means English, which the base prompt already is.
 */
export async function generateDealReview(
  snapshot: DealReviewSnapshot,
  locale?: string | null,
): Promise<DealReview> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT + languageDirectiveForJson(locale),
    messages: [
      {
        role: "user",
        content: `Closed-deal snapshot:\n\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Deal review returned no text");
  }
  return parseDealReviewResponse(textBlock.text);
}

/**
 * Tolerant parser. Strips fences, coerces each field to a safe shape,
 * never throws on partial data — worst case, the review has empty
 * arrays which the UI renders as "nothing notable."
 */
export function parseDealReviewResponse(raw: string): DealReview {
  const stripped = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`Deal review was not valid JSON: ${raw.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Deal review was not an object");
  }
  const p = parsed as Record<string, unknown>;
  return {
    generatedAtIso: new Date().toISOString(),
    headline: truncate(asString(p.headline) || "Deal closed.", 150),
    summary: truncate(asString(p.summary) || "", 800),
    whatWentWell: asStringArray(p.whatWentWell).slice(0, 3).map((s) => truncate(s, 300)),
    whereItStalled: asStringArray(p.whereItStalled).slice(0, 3).map((s) => truncate(s, 300)),
    patternObservations: asStringArray(p.patternObservations)
      .slice(0, 2)
      .map((s) => truncate(s, 300)),
    doDifferentlyNextTime: asStringArray(p.doDifferentlyNextTime)
      .slice(0, 3)
      .map((s) => truncate(s, 300)),
    executionScore: clampNullableScore(p.executionScore),
  };
}

/**
 * Baseline fallback — used when Claude is unavailable or throws. Pure
 * function from snapshot; no AI. Keeps the feature useful for
 * environments without an API key (and gives us something
 * deterministic to show in dev).
 */
export function buildFallbackReview(snapshot: DealReviewSnapshot): DealReview {
  const whatWentWell: string[] = [];
  const whereItStalled: string[] = [];
  const doDifferentlyNextTime: string[] = [];

  if (snapshot.taskTotal > 0) {
    const completionPct = Math.round((snapshot.taskCompleted / snapshot.taskTotal) * 100);
    if (completionPct >= 90) {
      whatWentWell.push(
        `${snapshot.taskCompleted} of ${snapshot.taskTotal} checklist tasks completed (${completionPct}%).`,
      );
    } else if (completionPct < 70) {
      whereItStalled.push(
        `Only ${completionPct}% of checklist tasks were completed. Missing steps can hide problems that surface post-close.`,
      );
    }
  }

  if (snapshot.taskLateCount > 0) {
    const biggestSlip = snapshot.taskSlipSamples[0];
    if (biggestSlip) {
      whereItStalled.push(
        `${snapshot.taskLateCount} task${snapshot.taskLateCount === 1 ? "" : "s"} completed late — worst was "${biggestSlip.title}" (${biggestSlip.slipDays}d past due).`,
      );
    }
  }

  if (
    snapshot.daysMutualToClose != null &&
    snapshot.agentAvgDaysMutualToClose != null &&
    snapshot.agentClosedCount >= 3
  ) {
    const delta = snapshot.daysMutualToClose - snapshot.agentAvgDaysMutualToClose;
    if (delta <= -3) {
      whatWentWell.push(
        `${snapshot.daysMutualToClose} days from mutual acceptance to close — ${Math.abs(delta)} days faster than your average.`,
      );
    } else if (delta >= 5) {
      whereItStalled.push(
        `${snapshot.daysMutualToClose} days to close — ${delta} days slower than your average (${snapshot.agentAvgDaysMutualToClose}).`,
      );
    }
  }

  if (snapshot.offerAcceptedToListRatio != null) {
    const pct = Math.round(snapshot.offerAcceptedToListRatio * 100);
    if (pct >= 100) {
      whatWentWell.push(`Accepted offer at ${pct}% of list — at or above ask.`);
    } else if (pct < 95) {
      whereItStalled.push(
        `Accepted offer at ${pct}% of list — more than a 5% discount.`,
      );
    }
  }

  if (snapshot.taskOverdueAtClose > 0) {
    doDifferentlyNextTime.push(
      `${snapshot.taskOverdueAtClose} task${snapshot.taskOverdueAtClose === 1 ? "" : "s"} still open at close — tighten your end-of-deal checklist review.`,
    );
  }
  if (snapshot.taskLateCount >= 3) {
    doDifferentlyNextTime.push(
      "Set calendar reminders 2 days before each checklist due-date to catch slips earlier.",
    );
  }
  if (doDifferentlyNextTime.length === 0) {
    doDifferentlyNextTime.push("Keep doing what you're doing — this deal ran clean.");
  }

  return {
    generatedAtIso: new Date().toISOString(),
    headline:
      whatWentWell.length > whereItStalled.length
        ? "Clean execution — deal ran mostly on schedule."
        : "Mixed execution — a few slippage points to address.",
    summary: `Closed ${snapshot.propertyAddress}${
      snapshot.daysMutualToClose != null ? ` in ${snapshot.daysMutualToClose} days` : ""
    }. AI debrief isn't available; this is a rule-based summary from your deal data.`,
    whatWentWell,
    whereItStalled,
    patternObservations: [],
    doDifferentlyNextTime,
    executionScore: null,
  };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : s;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0) as string[];
}
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
function clampNullableScore(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/**
 * Do we keep following up with someone who has not replied?
 *
 * Counting unanswered touches and stopping at N is the obvious rule and the
 * wrong one. A lead who never writes back but opens every listing we send is
 * not cold — they are reading. Dropping them at the fourth silent text throws
 * away the most interested person in the pipeline for the crime of being quiet.
 *
 * So silence alone never ends a ladder. Engagement does the deciding, and the
 * engagement score already answers this: `scoreBehavior` weights property views,
 * favourites, report unlocks, alert clicks and email opens, and decays every one
 * of them on a half-life with a hard zero floor. A lurker who keeps looking
 * holds their score up. Someone genuinely gone watches it fall to nothing on its
 * own — which is the "lower the rating first, then decide" rule, already built,
 * with no second writer touching contacts.rating.
 *
 * Three outcomes:
 *   continue   — still inside the ladder, nothing to reconsider yet.
 *   slow_down  — silent, but still reading. Drop to the cold interval and keep
 *                a light touch rather than stopping.
 *   stop       — silent AND no longer looking, or past the ceiling.
 *
 * Pure, so it can be tested and so the same rule can be read by the drip rail,
 * the briefing, and anything else that decides whether to send again.
 */

export type FollowUpDecision = "continue" | "slow_down" | "stop";

export type FollowUpCadenceRules = {
  /** Silent touches before we stop assuming they are merely busy. */
  reconsiderAfterUnanswered: number;
  /** Engagement (0-100) at or above which silence is not disinterest. */
  keepGoingAboveEngagement: number;
  /** Ceiling. Even an engaged lurker is not chased forever. */
  hardStopAfterUnanswered: number;
};

export function decideFollowUp(input: {
  /** Consecutive touches with no reply. */
  unanswered: number;
  /** 0-100 from scoreBehavior. Already recency-decayed. */
  engagementScore: number;
  cadence: FollowUpCadenceRules;
  /** An explicit opt-out ends it immediately, whatever the score says. */
  optedOut?: boolean;
}): { decision: FollowUpDecision; reason: string } {
  const { unanswered, engagementScore, cadence } = input;

  if (input.optedOut) {
    return { decision: "stop", reason: "They asked us to stop." };
  }
  if (unanswered < cadence.reconsiderAfterUnanswered) {
    return { decision: "continue", reason: "Still early in the follow-up." };
  }
  // The ceiling is absolute. Someone who has read twelve messages and answered
  // none of them has told us something, even if the score has not caught up.
  if (unanswered >= cadence.hardStopAfterUnanswered) {
    return {
      decision: "stop",
      reason: `${unanswered} messages with no reply — time to leave it.`,
    };
  }
  if (engagementScore >= cadence.keepGoingAboveEngagement) {
    return {
      decision: "slow_down",
      reason: `No replies, but they're still opening things (engagement ${Math.round(engagementScore)}). Easing off, not stopping.`,
    };
  }
  return {
    decision: "stop",
    reason: `${unanswered} messages, no replies, and nothing being opened (engagement ${Math.round(engagementScore)}).`,
  };
}

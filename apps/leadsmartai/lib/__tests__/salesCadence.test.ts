import { describe, it, expect } from "vitest";
import { salesModels } from "../sales-models";

const models = Object.values(salesModels);

/**
 * These numbers are meant to be tuned, which is exactly why they need a floor.
 * A ladder that goes backwards, or a model that quietly out-paces the aggressive
 * one, would send real messages to real people at the wrong rate — and nothing
 * else in the system would notice.
 */
describe("sales model cadence", () => {
  it("every model defines one", () => {
    for (const m of models) {
      expect(m.cadence, m.id).toBeTruthy();
    }
  });

  it("ladders run forwards", () => {
    for (const m of models) {
      for (const ladder of [m.cadence.hotLadderDays, m.cadence.warmLadderDays]) {
        expect(ladder.length, m.id).toBeGreaterThan(0);
        const sorted = [...ladder].sort((a, b) => a - b);
        expect(ladder, `${m.id} ladder must ascend`).toEqual(sorted);
        expect(new Set(ladder).size, `${m.id} ladder must not repeat a day`).toBe(ladder.length);
        expect(Math.min(...ladder), m.id).toBeGreaterThan(0);
      }
    }
  });

  it("chases a hot lead harder than a warm one", () => {
    for (const m of models) {
      expect(m.cadence.hotLadderDays.length, m.id).toBeGreaterThanOrEqual(
        m.cadence.warmLadderDays.length,
      );
    }
  });

  it("does not reconsider before it has spent its ladder", () => {
    for (const m of models) {
      expect(m.cadence.reconsiderAfterUnanswered, m.id).toBeGreaterThanOrEqual(
        m.cadence.hotLadderDays.length - 1,
      );
    }
  });

  it("leaves room between reconsidering and the hard ceiling", () => {
    // If these met, "slow down and keep a light touch" could never happen —
    // an engaged lurker would be reconsidered and stopped in the same breath.
    for (const m of models) {
      expect(m.cadence.hardStopAfterUnanswered, m.id).toBeGreaterThan(
        m.cadence.reconsiderAfterUnanswered,
      );
    }
  });

  it("sets an engagement floor that a real lurker can clear", () => {
    // 40 is "hot" elsewhere in the app. A floor at or above that would only
    // spare leads who were never at risk of being dropped.
    for (const m of models) {
      expect(m.cadence.keepGoingAboveEngagement, m.id).toBeGreaterThan(0);
      expect(m.cadence.keepGoingAboveEngagement, m.id).toBeLessThan(40);
    }
  });

  it("keeps Closer the fastest and Advisor the most patient", () => {
    // The models are a spectrum; if this inverts, the labels stop describing
    // what the software actually does.
    const closer = salesModels.closer.cadence;
    const advisor = salesModels.advisor.cadence;
    expect(closer.firstTouchMinutes).toBeLessThan(advisor.firstTouchMinutes);
    expect(closer.hotLadderDays.length).toBeGreaterThan(advisor.hotLadderDays.length);
    expect(closer.coldIntervalDays).toBeLessThan(advisor.coldIntervalDays);
  });

  it("keeps Friendly Connector the most social", () => {
    const friendly = salesModels.influencer.cadence.postsPerWeek;
    for (const m of models) {
      expect(m.cadence.postsPerWeek, m.id).toBeLessThanOrEqual(friendly);
    }
  });

  it("keeps the nurture orbit slower than active follow-up", () => {
    // If nurture came round faster than the ladder it would not be a slower
    // orbit at all — it would be the chase again under a calmer name.
    for (const m of models) {
      const lastLadderDay = Math.max(...m.cadence.hotLadderDays);
      expect(m.cadence.nurtureIntervalDays, m.id).toBeGreaterThan(lastLadderDay);
      expect(m.cadence.nurtureIntervalDays, m.id).toBeGreaterThanOrEqual(m.cadence.coldIntervalDays);
    }
  });

  it("has something to say at every rung of its ladder", () => {
    // The drip previously carried three generic lines for everyone, which
    // silently capped every model at three touches however long its ladder was.
    // A ladder longer than its copy is a ladder that stops early for a reason
    // nobody would find.
    for (const m of models) {
      expect(m.cadence.ladderMessages.length, m.id).toBe(m.cadence.hotLadderDays.length);
      for (const msg of m.cadence.ladderMessages) {
        expect(msg.trim().length, m.id).toBeGreaterThan(0);
        // Compliance text is appended at send time; writing it here would
        // double it up.
        expect(msg, m.id).not.toMatch(/reply stop/i);
        // Room for " Reply STOP to unsubscribe." inside one SMS segment budget.
        expect(msg.length, `${m.id}: "${msg.slice(0, 40)}…"`).toBeLessThanOrEqual(290);
      }
    }
  });

  it("only uses placeholders the sender knows how to fill", () => {
    const known = new Set(["name", "city", "brand"]);
    for (const m of models) {
      for (const msg of m.cadence.ladderMessages) {
        for (const match of msg.matchAll(/\{\{(\w+)\}\}/g)) {
          expect(known.has(match[1]), `${m.id} uses {{${match[1]}}}`).toBe(true);
        }
      }
    }
  });

  it("posts within what the schedule can hold", () => {
    // boss_autopilot_settings.posts_per_week is CHECKed to 1..7; a model
    // proposing more would fail the write with a constraint error at save time.
    for (const m of models) {
      expect(m.cadence.postsPerWeek, m.id).toBeGreaterThanOrEqual(1);
      expect(m.cadence.postsPerWeek, m.id).toBeLessThanOrEqual(7);
      expect(m.cadence.postThemes.length, m.id).toBeGreaterThan(0);
    }
  });
});

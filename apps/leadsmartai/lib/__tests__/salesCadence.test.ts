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

  it("gives up no sooner than it has touches to spend", () => {
    for (const m of models) {
      expect(m.cadence.stopAfterUnanswered, m.id).toBeGreaterThanOrEqual(
        m.cadence.hotLadderDays.length - 1,
      );
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

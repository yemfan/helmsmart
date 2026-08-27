import { describe, it, expect } from "vitest";
import { renderLadderMessage } from "../renderLadderMessage";
import { salesModels } from "../../sales-models";

const vars = { name: "Michael", city: "Alhambra", brand: "Michael Ye Real Estate" };

describe("renderLadderMessage", () => {
  it("fills every placeholder it knows", () => {
    const out = renderLadderMessage("Hi {{name}}, {{brand}} here about {{city}}.", vars);
    expect(out).toBe("Hi Michael, Michael Ye Real Estate here about Alhambra.");
  });

  it("strips an unknown placeholder rather than sending it", () => {
    // "Hi {{frist_name}}" reaching a client is worse than the clipped sentence.
    const out = renderLadderMessage("Hi {{name}}, about {{frist_name}} your home.", vars);
    expect(out).not.toMatch(/\{\{/);
    expect(out).toBe("Hi Michael, about your home.");
  });

  it("does not leave double spaces behind a removed placeholder", () => {
    expect(renderLadderMessage("A {{nope}} B", vars)).toBe("A B");
  });

  it("renders every shipped message with nothing left over", () => {
    for (const m of Object.values(salesModels)) {
      for (const t of m.cadence.ladderMessages) {
        const out = renderLadderMessage(t, vars);
        expect(out, m.id).not.toMatch(/\{\{|\}\}/);
        expect(out.length, m.id).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every rendered message inside one SMS segment with compliance room", () => {
    // addCompliance appends " Reply STOP to unsubscribe." and clamps at 320.
    const suffix = " Reply STOP to unsubscribe.".length;
    for (const m of Object.values(salesModels)) {
      for (const t of m.cadence.ladderMessages) {
        const out = renderLadderMessage(t, vars);
        expect(out.length + suffix, `${m.id}: ${out.slice(0, 40)}…`).toBeLessThanOrEqual(320);
      }
    }
  });
});

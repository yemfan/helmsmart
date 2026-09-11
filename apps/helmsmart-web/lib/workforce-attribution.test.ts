/**
 * Mark's answers count as his work — best-effort, exactly like Emma's calls:
 * an unseeded workforce is a no-op, and nothing here can throw into the answer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEmployee, incrementMetric } = vi.hoisted(() => ({
  getEmployee: vi.fn(),
  incrementMetric: vi.fn(),
}));
vi.mock("@helm/ai-workforce", () => ({
  getEmployee,
  incrementMetric,
  startRun: vi.fn(),
  completeRun: vi.fn(),
}));

import { MARK_QUESTIONS_METRIC, recordMarkAnswer } from "@/lib/workforce-attribution";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { translatorFor } from "@/lib/i18n/translator";

const db = {} as never;
const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordMarkAnswer", () => {
  it("counts one answered question for Mark", async () => {
    getEmployee.mockResolvedValue({ id: "emp-mark", slug: "mark" });
    incrementMetric.mockResolvedValue(1);

    await recordMarkAnswer(db, ORG);

    expect(getEmployee).toHaveBeenCalledWith(db, ORG, "mark");
    expect(incrementMetric).toHaveBeenCalledWith(db, ORG, {
      employeeId: "emp-mark",
      metricKey: "questions_answered",
    });
  });

  it("does nothing for an org that hasn't seeded its workforce", async () => {
    getEmployee.mockResolvedValue(null);
    await expect(recordMarkAnswer(db, ORG)).resolves.toBeUndefined();
    expect(incrementMetric).not.toHaveBeenCalled();
  });

  it("never throws when looking Mark up fails", async () => {
    getEmployee.mockRejectedValue(new Error("connection reset"));
    await expect(recordMarkAnswer(db, ORG)).resolves.toBeUndefined();
    expect(incrementMetric).not.toHaveBeenCalled();
  });

  it("never throws when the count can't be written", async () => {
    getEmployee.mockResolvedValue({ id: "emp-mark", slug: "mark" });
    incrementMetric.mockRejectedValue(new Error("new row violates row-level security policy"));
    await expect(recordMarkAnswer(db, ORG)).resolves.toBeUndefined();
  });
});

describe("the questions_answered label on the Command Center", () => {
  it("is real copy in every locale, not the humanized key", () => {
    const key = `metrics.${MARK_QUESTIONS_METRIC}`;
    const en = translatorFor("en", "home")(key);
    expect(en).toBe("Questions Answered");
    for (const locale of SUPPORTED_LOCALES) {
      const value = translatorFor(locale, "home")(key);
      expect(value, locale).toBeTruthy();
      expect(value, `${locale} resolved to its own key`).not.toBe(key);
      if (locale !== "en") expect(value, locale).not.toBe(en);
    }
  });
});

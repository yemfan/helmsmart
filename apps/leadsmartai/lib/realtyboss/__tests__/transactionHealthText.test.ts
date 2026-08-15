import { describe, expect, it } from "vitest";

import en from "@leadsmart/i18n/locale/en/dashboard";
import zh from "@leadsmart/i18n/locale/zh-Hans/dashboard";
import { assessTransactionHealth, type TransactionHealthInput } from "../transactionHealth";
import { happeningLine, levelLabel, missingLine, nextLine, riskLine } from "../transactionHealthText";

/** Minimal i18next stand-in: dotted lookup + {{var}} interpolation. */
function makeT(bundle: Record<string, unknown>) {
  return (key: string, opts?: Record<string, unknown>) => {
    const hit = key.split(".").reduce<unknown>((acc, seg) => (acc as Record<string, unknown>)?.[seg], bundle);
    if (typeof hit !== "string") return (opts?.defaultValue as string) ?? key;
    return hit.replace(/\{\{(\w+)\}\}/g, (_, n) => String(opts?.[n] ?? ""));
  };
}
const tEn = makeT(en as Record<string, unknown>);
const tZh = makeT(zh as Record<string, unknown>);

const BASE: TransactionHealthInput = {
  status: "active",
  inspection_deadline: null,
  inspection_completed_at: null,
  appraisal_deadline: null,
  appraisal_completed_at: null,
  loan_contingency_deadline: null,
  loan_contingency_removed_at: null,
  closing_date: null,
  task_total: 0,
  task_completed: 0,
  task_overdue: 0,
} as TransactionHealthInput;

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe("transaction health text", () => {
  it("renders the happening line in each language", () => {
    const h = assessTransactionHealth({ ...BASE, task_total: 10, task_completed: 4 });
    expect(happeningLine(h.happening, tEn)).toBe("In escrow · 40% of checklist done");
    expect(happeningLine(h.happening, tZh)).toBe("交易托管中 · 清单完成 40%");
  });

  it("passes an unknown status through instead of rendering a raw key", () => {
    const h = assessTransactionHealth({ ...BASE, status: "terminated" });
    expect(happeningLine(h.happening, tEn)).toBe("terminated");
    expect(happeningLine(h.happening, tZh)).toBe("terminated");
  });

  it("translates the milestone in an overdue risk, not just the sentence around it", () => {
    const h = assessTransactionHealth({ ...BASE, inspection_deadline: YESTERDAY });
    expect(h.level).toBe("at_risk");
    expect(riskLine(h.risk, tEn)).toContain("Inspection contingency");
    const zhRisk = riskLine(h.risk, tZh) ?? "";
    expect(zhRisk).toContain("验房期限");
    // The composed sentence must not leak English fragments.
    expect(zhRisk).not.toMatch(/passed|still open/);
  });

  it("marks the next milestone overdue in the right language", () => {
    const h = assessTransactionHealth({ ...BASE, inspection_deadline: YESTERDAY });
    expect(nextLine(h.next, tEn)).toContain("(overdue)");
    expect(nextLine(h.next, tZh)).toContain("已逾期");
  });

  it("singularises the overdue-task count", () => {
    expect(missingLine(1, tEn)).toBe("1 overdue checklist item");
    expect(missingLine(3, tEn)).toBe("3 overdue checklist items");
    expect(missingLine(0, tEn)).toBeNull();
  });

  it("labels each level", () => {
    expect(levelLabel("on_track", tEn)).toBe("On track");
    expect(levelLabel("at_risk", tZh)).toBe("存在风险");
  });
});

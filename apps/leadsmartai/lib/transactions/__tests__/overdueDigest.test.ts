import { describe, expect, it } from "vitest";
import { buildAgentDigest, renderDigestEmail } from "../overdueDigest";
import type { TransactionRow, TransactionTaskRow } from "../types";

function tx(overrides: Partial<TransactionRow & { contact_name: string | null }> = {}): TransactionRow & { contact_name: string | null } {
  return {
    id: "tx-1",
    agent_id: "agent-1",
    contact_id: "c-1",
    transaction_type: "buyer_rep",
    property_address: "123 Main St",
    city: null,
    state: null,
    zip: null,
    purchase_price: null,
    status: "active",
    terminated_reason: null,
    listing_start_date: null,
    mutual_acceptance_date: "2026-04-01",
    inspection_deadline: null,
    inspection_completed_at: null,
    appraisal_deadline: null,
    appraisal_completed_at: null,
    loan_contingency_deadline: null,
    loan_contingency_removed_at: null,
    closing_date: "2026-05-01",
    closing_date_actual: null,
    commission_pct: null,
    gross_commission: null,
    brokerage_split_pct: null,
    referral_fee_pct: null,
    agent_net_commission: null,
    seller_update_enabled: false,
    seller_update_last_sent_at: null,
    notes: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    contact_name: "Jane Buyer",
    ...overrides,
  };
}

function task(overrides: Partial<TransactionTaskRow> = {}): TransactionTaskRow {
  return {
    id: "t-1",
    transaction_id: "tx-1",
    stage: "inspection",
    title: "Order inspection",
    description: null,
    due_date: "2026-04-20",
    completed_at: null,
    completed_by: null,
    order_index: 0,
    seed_key: null,
    source: "seed",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildAgentDigest", () => {
  it("bins overdue vs upcoming relative to today", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({ id: "t-overdue", due_date: "2026-04-20" }), // 2d overdue
        task({ id: "t-today", due_date: "2026-04-22" }), // due today → upcoming (0 days)
        task({ id: "t-upcoming", due_date: "2026-04-24" }), // 2d away
        task({ id: "t-too-far", due_date: "2026-04-28" }), // 6d away — filtered
      ],
    });
    expect(out.overdueCount).toBe(1);
    expect(out.upcomingCount).toBe(2);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].overdue.map((t) => t.id)).toEqual(["t-overdue"]);
    expect(out.groups[0].upcoming.map((t) => t.id)).toEqual(["t-today", "t-upcoming"]);
  });

  it("drops tasks with no due date or completed_at set", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({ id: "t-nodate", due_date: null }),
        task({ id: "t-done", due_date: "2026-04-20", completed_at: "2026-04-19T00:00:00Z" }),
        task({ id: "t-ok", due_date: "2026-04-22" }),
      ],
    });
    expect(out.taskCount).toBe(1);
    expect(out.groups[0].upcoming[0].id).toBe("t-ok");
  });

  it("stops nagging about tasks overdue > 14 days", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({ id: "t-ancient", due_date: "2026-04-01" }), // 21d overdue → skip
        task({ id: "t-recent", due_date: "2026-04-10" }), // 12d overdue → included
      ],
    });
    expect(out.taskCount).toBe(1);
    expect(out.groups[0].overdue[0].id).toBe("t-recent");
  });

  it("skips tasks on non-active transactions", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx({ id: "tx-closed", status: "closed" })],
      tasks: [task({ transaction_id: "tx-closed", due_date: "2026-04-21" })],
    });
    expect(out.taskCount).toBe(0);
    expect(out.groups).toHaveLength(0);
  });

  it("flags the wire-verification task when it's overdue", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({
          id: "t-wire",
          seed_key: "verify_wire_instructions",
          due_date: "2026-04-21",
        }),
      ],
    });
    expect(out.hasWireVerificationOverdue).toBe(true);
    expect(out.groups[0].overdue[0].isWireVerification).toBe(true);
  });

  it("does NOT flag the wire task as critical when it's upcoming, only overdue", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({
          id: "t-wire",
          seed_key: "verify_wire_instructions",
          due_date: "2026-04-24",
        }),
      ],
    });
    expect(out.hasWireVerificationOverdue).toBe(false);
    expect(out.groups[0].upcoming[0].isWireVerification).toBe(true);
  });

  it("sorts groups so deals with overdue tasks come first", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [
        tx({ id: "tx-a", property_address: "A" }),
        tx({ id: "tx-b", property_address: "B" }),
      ],
      tasks: [
        task({ transaction_id: "tx-a", due_date: "2026-04-23" }), // upcoming
        task({ transaction_id: "tx-b", due_date: "2026-04-21" }), // overdue
      ],
    });
    expect(out.groups.map((g) => g.propertyAddress)).toEqual(["B", "A"]);
  });

  it("returns zero groups if nothing qualifies (caller should skip email)", () => {
    const out = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [],
    });
    expect(out.taskCount).toBe(0);
    expect(out.groups).toHaveLength(0);
  });
});

describe("renderDigestEmail", () => {
  it("uses a wire-specific subject line when wire verification is overdue", () => {
    const digest = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx()],
      tasks: [
        task({
          id: "t-wire",
          seed_key: "verify_wire_instructions",
          due_date: "2026-04-20",
        }),
      ],
    });
    const out = renderDigestEmail(digest, {
      appBaseUrl: "https://www.realtybossai.com",
    });
    expect(out.subject).toMatch(/wire verification overdue/i);
    expect(out.html).toMatch(/known phone number/i);
  });

  it("escapes HTML in property address + contact name", () => {
    const digest = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx({ property_address: "<script>x</script> 99 Oak", contact_name: "Jane & Co" })],
      tasks: [task({ due_date: "2026-04-22" })],
    });
    const out = renderDigestEmail(digest, { appBaseUrl: "https://x.test" });
    expect(out.html).not.toContain("<script>x</script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("Jane &amp; Co");
  });

  it("links directly into the transaction detail page", () => {
    const digest = buildAgentDigest({
      todayIso: "2026-04-22",
      transactions: [tx({ id: "abc-123" })],
      tasks: [task({ transaction_id: "abc-123", due_date: "2026-04-22" })],
    });
    const out = renderDigestEmail(digest, { appBaseUrl: "https://x.test" });
    expect(out.html).toContain("https://x.test/dashboard/transactions/abc-123");
  });
});

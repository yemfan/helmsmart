import { describe, expect, it } from "vitest";
import { feeOf, movesFor, orderForAgent, parseReferralInput, statusAfter, summarizeReferrals, type Referral } from "../referrals";

const ref = (over: Partial<Referral>): Referral => ({
  id: "r1",
  fromAgentId: "a",
  toAgentId: "b",
  contactId: "c1",
  copiedContactId: "c2",
  contactName: "Lee Buyer",
  feePct: 25,
  note: null,
  status: "open",
  closedAmount: null,
  createdAt: "2026-09-01T00:00:00Z",
  respondedAt: null,
  closedAt: null,
  ...over,
});

describe("parseReferralInput", () => {
  it("accepts a colleague, a contact and a fee in range", () => {
    expect(parseReferralInput({ toAgentId: "b", contactId: "c1", feePct: "25", note: " hot buyer " }, "a")).toEqual({ ok: true, input: { toAgentId: "b", contactId: "c1", feePct: 25, note: "hot buyer" } });
  });

  it("refuses referring to yourself, a fee out of range, and a missing contact", () => {
    expect(parseReferralInput({ toAgentId: "a", contactId: "c1", feePct: 25 }, "a")).toEqual({ ok: false, field: "toAgentId", reason: "self" });
    expect(parseReferralInput({ toAgentId: "b", contactId: "c1", feePct: 80 }, "a")).toEqual({ ok: false, field: "feePct", reason: "range" });
    expect(parseReferralInput({ toAgentId: "b", contactId: "", feePct: 25 }, "a")).toEqual({ ok: false, field: "contactId", reason: "required" });
  });
});

describe("movesFor", () => {
  it("lets the receiver answer, the sender withdraw, and only the receiver close", () => {
    const open = ref({});
    expect(movesFor(open, "b")).toEqual(["accept", "decline"]);
    expect(movesFor(open, "a")).toEqual(["withdraw"]);
    expect(movesFor(open, "z")).toEqual([]);
    const accepted = ref({ status: "accepted" });
    expect(movesFor(accepted, "b")).toEqual(["close"]);
    expect(movesFor(accepted, "a")).toEqual([]);
    expect(movesFor(ref({ status: "closed" }), "b")).toEqual([]);
  });

  it("maps moves to statuses", () => {
    expect(statusAfter("accept")).toBe("accepted");
    expect(statusAfter("decline")).toBe("declined");
    expect(statusAfter("withdraw")).toBe("declined");
    expect(statusAfter("close")).toBe("closed");
  });
});

describe("money", () => {
  it("computes the fee to the cent and sums closed referrals", () => {
    expect(feeOf(1_045_000, 25)).toBe(261_250);
    expect(feeOf(333.33, 25)).toBe(83.33);
    const s = summarizeReferrals([ref({ status: "closed", closedAmount: 1_000_000 }), ref({ id: "r2", status: "closed", closedAmount: 500_000, feePct: 20 }), ref({ id: "r3" }), ref({ id: "r4", status: "declined" })]);
    expect(s).toEqual({ open: 1, accepted: 0, closed: 2, declined: 1, closedVolume: 1_500_000, fees: 350_000 });
  });
});

describe("orderForAgent", () => {
  it("puts what waits on the agent first, then newest", () => {
    const rows = [ref({ id: "old", createdAt: "2026-08-01T00:00:00Z", status: "closed" }), ref({ id: "mine", createdAt: "2026-08-15T00:00:00Z" }), ref({ id: "new", createdAt: "2026-09-01T00:00:00Z", status: "declined" })];
    expect(orderForAgent(rows, "b").map((r) => r.id)).toEqual(["mine", "new", "old"]);
  });
});

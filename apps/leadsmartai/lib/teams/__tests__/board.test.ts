import { describe, expect, it } from "vitest";
import { orderPosts, parseBoardInput, parsePrice, parseReply, possibleMatches, type BoardPost } from "../board";

const post = (over: Partial<BoardPost>): BoardPost => ({ id: "p", kind: "other", title: "t", body: null, linkUrl: null, price: null, authorAgentId: "a", createdAt: "2026-09-01T00:00:00Z", likes: 0, likedByMe: false, replies: [], ...over });

describe("parseBoardInput", () => {
  it("accepts a listing with a price, and drops the price on kinds that have none", () => {
    expect(parseBoardInput({ kind: "listing", title: " Coming soon in Arcadia ", body: "", linkUrl: "https://x.test/l", price: "$1,100,000" })).toEqual({ ok: true, input: { kind: "listing", title: "Coming soon in Arcadia", body: null, linkUrl: "https://x.test/l", price: 1_100_000 } });
    const q = parseBoardInput({ kind: "question", title: "Inspector?", price: "500" });
    expect(q.ok && q.input.price).toBeNull();
  });

  it("refuses an unknown kind, an empty title, a bad link and a nonsense price", () => {
    expect(parseBoardInput({ kind: "spam", title: "x" })).toEqual({ ok: false, field: "kind", reason: "required" });
    expect(parseBoardInput({ kind: "tip", title: " " })).toEqual({ ok: false, field: "title", reason: "required" });
    expect(parseBoardInput({ kind: "tip", title: "x", linkUrl: "javascript:alert(1)" })).toEqual({ ok: false, field: "linkUrl", reason: "bad_url" });
    expect(parseBoardInput({ kind: "listing", title: "x", price: "a lot" })).toEqual({ ok: false, field: "price", reason: "range" });
  });
});

describe("parsePrice and parseReply", () => {
  it("reads money the way people type it", () => {
    expect(parsePrice("$1,250,000")).toBe(1_250_000);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-5")).toBeNaN();
  });
  it("needs words, not too many", () => {
    expect(parseReply("  sure  ")).toEqual({ ok: true, body: "sure" });
    expect(parseReply("")).toEqual({ ok: false, reason: "required" });
    expect(parseReply("x".repeat(1001))).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("possibleMatches", () => {
  const listing = post({ id: "L", kind: "listing", title: "Coming soon: 3/2 in Arcadia", body: "Quiet street, big yard", price: 1_100_000 });
  const buyerFits = post({ id: "B1", kind: "buyer_need", title: "Buyer up to $1.2M, Arcadia or Pasadena", price: 1_200_000 });
  const buyerPoor = post({ id: "B2", kind: "buyer_need", title: "Arcadia buyer, $800K max", price: 800_000 });
  const buyerElsewhere = post({ id: "B3", kind: "buyer_need", title: "Buyer in Torrance, $1.5M", price: 1_500_000 });
  const tip = post({ id: "T", kind: "tip", title: "Arcadia permits are slow" });

  it("pairs a listing with buyer needs that fit on price and place, both ways", () => {
    expect(possibleMatches(listing, [buyerFits, buyerPoor, buyerElsewhere, tip]).map((p) => p.id)).toEqual(["B1"]);
    expect(possibleMatches(buyerFits, [listing, tip]).map((p) => p.id)).toEqual(["L"]);
    expect(possibleMatches(tip, [listing, buyerFits])).toEqual([]);
  });

  it("orders newest first", () => {
    expect(orderPosts([post({ id: "a", createdAt: "2026-09-01T00:00:00Z" }), post({ id: "b", createdAt: "2026-09-02T00:00:00Z" })]).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

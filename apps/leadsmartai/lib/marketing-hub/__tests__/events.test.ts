import { describe, expect, it } from "vitest";
import { isBeaconEventType, sanitizeBeaconMeta, summariseHubMetrics } from "../events";

describe("beacon allowlist", () => {
  it("accepts hub events and rejects the ones with their own routes", () => {
    expect(isBeaconEventType("tool_opened")).toBe(true);
    expect(isBeaconEventType("page_view")).toBe(false);
    expect(isBeaconEventType("conversion")).toBe(false);
    expect(isBeaconEventType("drop table")).toBe(false);
  });

  it("keeps only known metadata keys, trimmed and clamped", () => {
    const meta = sanitizeBeaconMeta({ tool: "  mortgage ", evil: "x", label: "a".repeat(500) });
    expect(meta).toEqual({ tool: "mortgage", label: "a".repeat(120) });
  });
});

describe("summariseHubMetrics", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();

  it("is empty for no rows and still has a zero-filled series", () => {
    const m = summariseHubMetrics([], { days: 7, now });
    expect(m.empty).toBe(true);
    expect(m.viewsByDay).toHaveLength(7);
    expect(m.conversionRate).toBeNull();
  });

  it("counts visitors by distinct id, leads by conversion, and tools by key", () => {
    const m = summariseHubMetrics(
      [
        { event_type: "page_view", visitor_id: "a", source: "facebook", created_at: at(1) },
        { event_type: "page_view", visitor_id: "a", source: "facebook", created_at: at(0) },
        { event_type: "page_view", visitor_id: "b", created_at: at(0) },
        { event_type: "page_view", created_at: at(0) },
        { event_type: "conversion", visitor_id: "a", created_at: at(0) },
        { event_type: "tool_opened", metadata: { tool: "mortgage" }, created_at: at(0) },
        { event_type: "tool_opened", metadata: { tool: "mortgage" }, created_at: at(0) },
        { event_type: "tool_opened", metadata: { tool: "roi" }, created_at: at(0) },
        { event_type: "ai_open", created_at: at(0) },
        { event_type: "appointment_booked", created_at: at(0) },
      ],
      { days: 7, now },
    );
    expect(m.views).toBe(4);
    expect(m.visitors).toBe(2);
    expect(m.leads).toBe(1);
    expect(m.conversionRate).toBe(0.5);
    expect(m.topTools).toEqual([
      { key: "mortgage", count: 2 },
      { key: "roi", count: 1 },
    ]);
    expect(m.topSources).toEqual([{ source: "facebook", count: 2 }]);
    expect(m.aiConversations).toBe(1);
    expect(m.appointments).toBe(1);
    expect(m.empty).toBe(false);
    expect(m.viewsByDay.at(-1)?.views).toBe(3);
  });
});

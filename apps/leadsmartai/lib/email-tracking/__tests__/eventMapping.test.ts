import { describe, expect, it } from "vitest";
import { parseResendEvent } from "../eventMapping";

describe("parseResendEvent", () => {
  it("maps email.delivered to internal 'delivered' event type", () => {
    const out = parseResendEvent({
      type: "email.delivered",
      created_at: "2026-04-28T10:00:00Z",
      data: { email_id: "abc-123", to: ["a@b.com"], subject: "Hi" },
    });
    expect(out).toEqual({
      externalMessageId: "abc-123",
      eventType: "delivered",
      url: null,
      occurredAt: "2026-04-28T10:00:00Z",
      metadata: { to: ["a@b.com"], subject: "Hi" },
    });
  });

  it("captures the click target on email.clicked events", () => {
    const out = parseResendEvent({
      type: "email.clicked",
      created_at: "2026-04-28T10:05:00Z",
      data: {
        email_id: "abc-123",
        click: { link: "https://closebossai.com/listing/42" },
      },
    });
    expect(out?.eventType).toBe("clicked");
    expect(out?.url).toBe("https://closebossai.com/listing/42");
  });

  it("returns null for unrecognized event types so the route can 200", () => {
    expect(parseResendEvent({ type: "email.experimental", data: { email_id: "x" } })).toBeNull();
  });

  it("returns null when email_id is missing — unmappable to a thread", () => {
    expect(parseResendEvent({ type: "email.opened", data: {} })).toBeNull();
  });

  it("strips email_id and click from metadata since they're first-class columns", () => {
    const out = parseResendEvent({
      type: "email.clicked",
      data: { email_id: "x", click: { link: "u" }, ip_address: "1.2.3.4" },
    });
    expect(out?.metadata).toEqual({ ip_address: "1.2.3.4" });
  });

  it("falls back to a sane occurredAt when created_at is missing", () => {
    const out = parseResendEvent({ type: "email.delivered", data: { email_id: "x" } });
    expect(out?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("maps email.delivery_delayed to 'delayed'", () => {
    const out = parseResendEvent({ type: "email.delivery_delayed", data: { email_id: "x" } });
    expect(out?.eventType).toBe("delayed");
  });
});

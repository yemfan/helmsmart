import { describe, expect, it } from "vitest";

import { mapCallStatus } from "../mapCallStatus";

describe("mapCallStatus", () => {
  it("never calls a call that did not connect completed", () => {
    // The exact shape Retell returned for every outbound call this week:
    // carrier rejected the INVITE, 0 ms, reason user_declined.
    expect(mapCallStatus("not_connected", "user_declined")).toBe("failed");
    expect(mapCallStatus("not_connected", "dial_failed")).toBe("failed");
    expect(mapCallStatus("not_connected", "some_new_reason")).toBe("failed");
  });

  it("keeps the specific outcomes", () => {
    expect(mapCallStatus("not_connected", "dial_no_answer")).toBe("no_answer");
    expect(mapCallStatus("not_connected", "dial_busy")).toBe("busy");
    expect(mapCallStatus("ended", "voicemail_reached")).toBe("voicemail");
    expect(mapCallStatus("ended", "machine_detected")).toBe("voicemail");
  });

  it("treats provider and routing problems as failures", () => {
    expect(mapCallStatus("ended", "telephony_provider_permission_denied")).toBe("failed");
    expect(mapCallStatus("ended", "sip_routing_error")).toBe("failed");
    expect(mapCallStatus("ended", "registered_call_timeout")).toBe("failed");
    expect(mapCallStatus("error", undefined)).toBe("failed");
  });

  it("still completes a conversation that ended normally", () => {
    expect(mapCallStatus("ended", "user_hangup")).toBe("completed");
    expect(mapCallStatus("ended", "agent_hangup")).toBe("completed");
    expect(mapCallStatus("ended", "call_transfer")).toBe("completed");
    expect(mapCallStatus("ended", "max_duration_reached")).toBe("completed");
  });
});

import { describe, expect, it } from "vitest";

import { connectionHealth } from "../health";

describe("connectionHealth", () => {
  it("calls a healthy row connected", () => {
    expect(connectionHealth("connected")).toBe("connected");
  });

  it("treats ANY non-connected status as needing the agent, not as silence", () => {
    // This is the whole point. The connect page used to print the raw enum —
    // the literal word "error" — next to a row that otherwise looked normal,
    // while the sentence saying what to do sat unread in last_error. A channel
    // that cannot publish has to be loud.
    expect(connectionHealth("error")).toBe("attention");
    expect(connectionHealth("revoked")).toBe("attention");
    expect(connectionHealth("expired")).toBe("attention");
    expect(connectionHealth("something_new_we_add_later")).toBe("attention");
  });

  it("treats a missing status as not connected rather than broken", () => {
    // No row at all is not a fault the agent needs to fix — it just means they
    // haven't connected it yet, so it stays gray.
    expect(connectionHealth(null)).toBe("disconnected");
    expect(connectionHealth(undefined)).toBe("disconnected");
    expect(connectionHealth("")).toBe("disconnected");
  });

  it("lets unavailable outrank everything, including a valid connection", () => {
    // Pinterest on Trial access and TikTok before its content audit both hold
    // perfectly good tokens and still publish nothing. Telling the agent to
    // reconnect would send them round a loop they cannot win.
    expect(connectionHealth("connected", { unavailable: true })).toBe("unavailable");
    expect(connectionHealth("error", { unavailable: true })).toBe("unavailable");
    expect(connectionHealth(null, { unavailable: true })).toBe("unavailable");
  });

  it("ignores the flag when it is false", () => {
    expect(connectionHealth("connected", { unavailable: false })).toBe("connected");
  });
});

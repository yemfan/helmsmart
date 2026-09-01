import { describe, it, expect } from "vitest";
import { finishedNormally } from "../callerTextBackCopy";

/**
 * Decides whether a caller gets a courtesy text after the call. The receptionist
 * closes a finished conversation with `end_call`, which Retell records as
 * `agent_hangup`; everything else means she never got to wrap up.
 *
 * Checked against twelve real calls — `agent_hangup` and an `end_call`
 * invocation matched on every one.
 */
describe("finishedNormally", () => {
  it("is true only when the receptionist ended the call herself", () => {
    expect(finishedNormally("agent_hangup")).toBe(true);
  });

  it("is false when the caller hangs up — however long they talked", () => {
    // A real 265-second call that ended this way: a full conversation, but she
    // never got to close it.
    expect(finishedNormally("user_hangup")).toBe(false);
  });

  it("is false for silence, voicemail, and the duration cap", () => {
    expect(finishedNormally("inactivity")).toBe(false);
    expect(finishedNormally("voicemail_reached")).toBe(false);
    expect(finishedNormally("machine_detected")).toBe(false);
    expect(finishedNormally("max_duration_reached")).toBe(false);
  });

  it("is false for errors and dial failures", () => {
    expect(finishedNormally("error_llm_websocket_open")).toBe(false);
    expect(finishedNormally("dial_no_answer")).toBe(false);
  });

  it("treats an unknown reason as NOT normal", () => {
    // A reason we have never seen is likelier to be a new failure mode than a
    // new way of succeeding, and the cost of being wrong is one courtesy text.
    expect(finishedNormally("something_new_from_retell")).toBe(false);
    expect(finishedNormally(null)).toBe(false);
    expect(finishedNormally(undefined)).toBe(false);
    expect(finishedNormally("")).toBe(false);
  });

  it("is not fooled by case or padding", () => {
    expect(finishedNormally("  Agent_Hangup  ")).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { recordNurtureAlert } from "../recordAlert";

function clientReturning(error: unknown) {
  const insert = vi.fn().mockResolvedValue({ error });
  return { client: { from: () => ({ insert }) }, insert };
}

describe("recordNurtureAlert", () => {
  it("stores the alert and says so", async () => {
    const { client, insert } = clientReturning(null);
    const ok = await recordNurtureAlert(
      { agentId: "26", contactId: "c-1", type: "hot", message: "High intent SMS" },
      client,
    );
    expect(ok).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      agent_id: 26,
      contact_id: "c-1",
      type: "hot",
      message: "High intent SMS",
    });
  });

  it("sends a bigint agent id, not the string the callers hold", async () => {
    // The old column was uuid and the callers pass String(row.agent_id) — "26"
    // — which is what made every insert fail.
    const { client, insert } = clientReturning(null);
    await recordNurtureAlert({ agentId: "26", contactId: "c-1", type: "hot", message: "m" }, client);
    expect(insert.mock.calls[0][0].agent_id).toBe(26);
  });

  it("passes a missing agent through as null rather than inventing one", async () => {
    const { client, insert } = clientReturning(null);
    for (const agentId of [null, undefined, ""]) {
      await recordNurtureAlert({ agentId, contactId: "c-1", type: "hot", message: "m" }, client);
    }
    for (const call of insert.mock.calls) expect(call[0].agent_id).toBeNull();
  });

  it("reports a rejected insert instead of swallowing it", async () => {
    // The whole point: twelve call sites wrapped this in `catch {}` and the
    // table stayed empty for its entire life without anyone being told.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientReturning({ message: "null value in column lead_id" });
    const ok = await recordNurtureAlert(
      { agentId: 26, contactId: "c-1", type: "hot", message: "m" },
      client,
    );
    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not throw when the client itself blows up", async () => {
    // Failing to note an alert must never fail the webhook that triggered it.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { from: () => ({ insert: () => Promise.reject(new Error("network")) }) };
    await expect(
      recordNurtureAlert({ agentId: 26, contactId: "c-1", type: "hot", message: "m" }, client),
    ).resolves.toBe(false);
    spy.mockRestore();
  });

  it("refuses an alert with no contact, which nothing could ever read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, insert } = clientReturning(null);
    expect(await recordNurtureAlert({ agentId: 26, contactId: "", type: "hot", message: "m" }, client)).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import {
  demoDynamicVariables,
  demoLanguage,
  envVarFor,
  pickDemoAgentId,
  resolveRetellDemoConfig,
  e164FromNumber,
} from "../retellAgent";

const base = { apiKey: "k", fromNumber: "+18778017240", inboundAgentId: "agent_inbound" };

describe("demoLanguage", () => {
  it("treats every zh variant as Chinese", () => {
    for (const raw of ["zh", "zh-Hans", "zh-CN", "ZH-hant"]) {
      expect(demoLanguage(raw)).toBe("zh");
    }
  });

  it("defaults to English for anything else", () => {
    for (const raw of ["en", "en-US", "es", "", null, undefined]) {
      expect(demoLanguage(raw)).toBe("en");
    }
  });
});

describe("pickDemoAgentId", () => {
  it("falls back to the inbound receptionist when no split is configured", () => {
    // The point of the fallback: with one agent, every demo uses the one that
    // is actually tuned in Retell's console.
    expect(pickDemoAgentId(base, "en")).toBe("agent_inbound");
    expect(pickDemoAgentId(base, "zh")).toBe("agent_inbound");
  });

  it("uses a Chinese agent when one is configured, English unaffected", () => {
    const env = { ...base, agentIdZh: "agent_zh" };
    expect(pickDemoAgentId(env, "zh")).toBe("agent_zh");
    expect(pickDemoAgentId(env, "en")).toBe("agent_inbound");
  });

  it("supports splitting both languages", () => {
    const env = { ...base, agentIdEn: "agent_en", agentIdZh: "agent_zh" };
    expect(pickDemoAgentId(env, "en")).toBe("agent_en");
    expect(pickDemoAgentId(env, "zh")).toBe("agent_zh");
  });

  it("ignores a blank override rather than dialling with an empty agent", () => {
    expect(pickDemoAgentId({ ...base, agentIdZh: "   " }, "zh")).toBe("agent_inbound");
  });
});

describe("resolveRetellDemoConfig", () => {
  it("resolves when everything is present", () => {
    const out = resolveRetellDemoConfig(base, "en");
    expect(out).toEqual({ ok: true, config: { apiKey: "k", fromNumber: "+18778017240", agentId: "agent_inbound" } });
  });

  it("names the missing piece rather than just failing", () => {
    expect(resolveRetellDemoConfig({ ...base, apiKey: "" }, "en")).toEqual({ ok: false, problem: "missing_api_key" });
    expect(resolveRetellDemoConfig({ ...base, fromNumber: "" }, "en")).toEqual({ ok: false, problem: "missing_from_number" });
    expect(resolveRetellDemoConfig({ ...base, inboundAgentId: "" }, "en")).toEqual({ ok: false, problem: "missing_agent_id" });
  });

  it("points at the env var to set", () => {
    expect(envVarFor("missing_api_key")).toBe("RETELL_API_KEY");
    expect(envVarFor("missing_from_number")).toBe("RETELL_DEMO_FROM_NUMBER");
    expect(envVarFor("missing_agent_id")).toContain("RETELL_INBOUND_AGENT_ID");
  });
});

describe("demoDynamicVariables", () => {
  it("tells the agent this is a demo so it does not open like a lead call", () => {
    expect(demoDynamicVariables({ language: "zh", prospectName: " Michelle " })).toEqual({
      is_demo: "true",
      language: "zh",
      caller_name: "Michelle",
    });
  });

  it("sends an empty name rather than the word undefined", () => {
    expect(demoDynamicVariables({ language: "en", prospectName: null }).caller_name).toBe("");
  });
});

describe("e164FromNumber", () => {
  /*
   * Production ran with RETELL_DEMO_FROM_NUMBER=18778017240 — the right
   * number, pasted without its plus. Retell matches from_number against the
   * account's registered numbers and answers a miss with a bare 404, the same
   * 404 it gives for an unknown agent, so nothing in the response said which
   * was wrong. Every demo call fell through to the legacy Twilio bot while the
   * page promised a receptionist.
   */
  it("adds the plus that was missing in production", () => {
    expect(e164FromNumber("18778017240")).toBe("+18778017240");
  });

  it("leaves an already-E.164 number exactly as it is", () => {
    expect(e164FromNumber("+18778017240")).toBe("+18778017240");
    expect(e164FromNumber("  +18778017240  ")).toBe("+18778017240");
  });

  it("completes a bare US 10-digit number", () => {
    expect(e164FromNumber("8778017240")).toBe("+18778017240");
    expect(e164FromNumber("(877) 801-7240")).toBe("+18778017240");
  });

  it("returns empty for empty, so the caller still reports it missing", () => {
    expect(e164FromNumber("")).toBe("");
    expect(e164FromNumber("   ")).toBe("");
  });

  it("leaves something that is not a phone number alone, to fail visibly", () => {
    // Silently rewriting junk into a plausible-looking number would hide the
    // mistake behind another 404.
    expect(e164FromNumber("not-a-number")).toBe("not-a-number");
  });

  it("is applied by resolveRetellDemoConfig, not just exported", () => {
    const resolved = resolveRetellDemoConfig(
      { apiKey: "k", fromNumber: "18778017240", inboundAgentId: "agent_x" },
      "en",
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.config.fromNumber).toBe("+18778017240");
  });
});

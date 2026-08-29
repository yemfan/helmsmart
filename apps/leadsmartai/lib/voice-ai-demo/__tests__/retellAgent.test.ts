import { describe, expect, it } from "vitest";
import {
  demoDynamicVariables,
  demoLanguage,
  envVarFor,
  pickDemoAgentId,
  resolveRetellDemoConfig,
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

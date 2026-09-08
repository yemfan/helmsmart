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

describe("the destination the demo route actually produces", () => {
  /*
   * The route builds the phone with formatUsPhone(), which returns a DISPLAY
   * string for the CRM row — "(626) 625-5055" — and passed it into a parameter
   * named toPhoneE164. Retell cannot read a country off that, so it answered
   * every demo with "Country is not in the allowed outbound country list for
   * this phone number": an account-permission message for a malformed
   * argument. Hours went into the Retell dashboard because of it.
   */
  const formatUsPhone = (input: string): string | null => {
    const digits = input.replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) return null;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  it("turns the CRM display format into something Retell can dial", () => {
    const display = formatUsPhone("(626) 625-5055");
    expect(display).toBe("(626) 625-5055");
    expect(e164FromNumber(display!)).toBe("+16266255055");
  });

  it("handles the other shapes a person types into the form", () => {
    for (const typed of ["626-625-5055", "626.625.5055", "6266255055", "1 626 625 5055"]) {
      const display = formatUsPhone(typed);
      expect(e164FromNumber(display!), typed).toBe("+16266255055");
    }
  });
});

describe("the demo opens like an outbound call, not an inbound one", () => {
  /*
   * Retell's Welcome Message is "{{greeting}}". The demo passed the inbound
   * bundle, whose greeting is OPENING_HELLO — "Hello, 您好, Hola". That is
   * correct for a stranger dialling the business (the AI does not know their
   * language yet) and wrong for a call WE placed to someone who asked for it:
   * they answer an unknown number and hear three words in three languages with
   * no business name and no reason for the call.
   */
  it("greets an outbound demo by name, as an AI, on behalf of the business", async () => {
    const { buildOutboundGreeting } = await import("@repo/voice");
    const ctx = {
      agentName: "Lucy",
      orgName: "Michael Ye Real Estate",
      orgNameZh: "Michael Ye Real Estate",
    } as Parameters<typeof buildOutboundGreeting>[0];

    const greeting = buildOutboundGreeting(ctx, "Michael");

    expect(greeting).toContain("Michael");
    expect(greeting).toContain("Michael Ye Real Estate");
    // The AI disclosure is not optional.
    expect(greeting).toContain("AI");
    // And it is nothing like the inbound opener.
    expect(greeting).not.toBe("Hello, 您好, Hola");
  });

  it("still forms a sentence when the prospect left their name blank", () => {
    // The form's name field is required today, but the greeting must not read
    // "Hi , this is…" if that ever changes.
    return import("@repo/voice").then(({ buildOutboundGreeting }) => {
      const ctx = {
        agentName: "Lucy",
        orgName: "Michael Ye Real Estate",
        orgNameZh: "Michael Ye Real Estate",
      } as Parameters<typeof buildOutboundGreeting>[0];
      expect(buildOutboundGreeting(ctx, "")).toContain("Hi there");
    });
  });
});

describe("the demo call states its reason", () => {
  /*
   * A greeting that names you, discloses the AI and asks "is now a good time?"
   * is a polite way of saying nothing: the person has answered an unknown
   * number and still does not know what the call is about. And she did not
   * know either — the demo sent the INBOUND system prompt, written for someone
   * who had dialled the business, so after introducing herself she waited to be
   * told why she had called.
   */
  it("says why she is calling, in the opening line", async () => {
    const { buildOutboundGreeting } = await import("@repo/voice");
    const ctx = {
      agentName: "Lucy",
      orgName: "Michael Ye Real Estate",
      orgNameZh: "Michael Ye Real Estate",
    } as Parameters<typeof buildOutboundGreeting>[0];

    const demo = buildOutboundGreeting(ctx, "Michael", "demo");
    expect(demo).toContain("Michael");
    expect(demo).toContain("AI");
    expect(demo.toLowerCase()).toContain("website");
    expect(demo).toContain("AI前台");
  });

  it("leaves the other outbound purposes worded as they were", () => {
    // follow-ups and reminders carry a per-call detail that belongs in the
    // conversation, not in the first breath.
    return import("@repo/voice").then(({ buildOutboundGreeting }) => {
      const ctx = {
        agentName: "Lucy",
        orgName: "Michael Ye Real Estate",
        orgNameZh: "Michael Ye Real Estate",
      } as Parameters<typeof buildOutboundGreeting>[0];
      expect(buildOutboundGreeting(ctx, "Michael", "follow_up")).toBe(
        buildOutboundGreeting(ctx, "Michael"),
      );
    });
  });

  it("tells her the call is an evaluation with nothing to sell", async () => {
    const { buildOutboundSystemPrompt } = await import("@repo/voice");
    const ctx = {
      agentName: "Lucy",
      orgName: "Michael Ye Real Estate",
      orgNameZh: "Michael Ye Real Estate",
      hoursText: "Mon-Fri 9-5",
      typesText: "Showing",
      knowledgeText: "",
      extraNotes: "",
      todayISO: "2026-09-08",
      todayLabel: "Monday, September 8",
      timezone: "America/Los_Angeles",
    } as Parameters<typeof buildOutboundSystemPrompt>[0];

    const prompt = buildOutboundSystemPrompt(ctx, { leadName: "Michael", purpose: "demo" });
    expect(prompt).toContain("evaluating");
    expect(prompt).toContain("nothing to sell");
    expect(prompt).toContain("YOU placed this call");
  });
});

describe("the greeting speaks the language they asked for", () => {
  const ctx = {
    agentName: "Emma",
    orgName: "Michael Ye Real Estate",
    orgNameZh: "Michael Ye Real Estate",
  } as never;

  it("says it once in English when English was chosen", async () => {
    const { buildOutboundGreeting } = await import("@repo/voice");
    const en = buildOutboundGreeting(ctx, "Michael", "demo", "en");
    expect(en).toContain("this is Emma");
    expect(en.toLowerCase()).toContain("website");
    // Not the Chinese half as well — the person already told us.
    expect(en).not.toContain("AI助理");
  });

  it("says it once in Chinese when Chinese was chosen", async () => {
    const { buildOutboundGreeting } = await import("@repo/voice");
    const zh = buildOutboundGreeting(ctx, "Michael", "demo", "zh");
    expect(zh).toContain("AI助理");
    expect(zh).toContain("AI前台");
    expect(zh).not.toContain("this is Emma");
  });

  it("still says both when nobody has told us — a lead we are following up", async () => {
    // This is the existing behaviour for every non-demo outbound call and it
    // must not change: whichever language they speak, they understand the
    // opening.
    const { buildOutboundGreeting } = await import("@repo/voice");
    const both = buildOutboundGreeting(ctx, "Michael", "follow_up");
    expect(both).toContain("this is Emma");
    expect(both).toContain("AI助理");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: vi.fn(),
  isAnthropicConfigured: () => false,
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const { looksChinese, smoothForSpeech } = await import("../avatarStudio");

describe("looksChinese", () => {
  it("recognises a Mandarin script", () => {
    expect(
      looksChinese("大家好，我是专门做洛杉矶房地产的。在洛杉矶，真正的好房子不只是一栋房子。"),
    ).toBe(true);
  });

  it("still recognises Mandarin carrying a Latin place name", () => {
    // The real script had "Arcadia" in the middle of it.
    expect(
      looksChinese("像Arcadia这样的核心区域，好学区好环境，这样的项目稀缺又难得，值得认真看。"),
    ).toBe(true);
  });

  it("does not flip on English", () => {
    expect(
      looksChinese("Hi, I'm a real estate agent in Los Angeles and I help buyers find the right home."),
    ).toBe(false);
  });

  it("does not flip on an English script with one stray CJK character", () => {
    expect(looksChinese("I work in Los Angeles and my clients call me 好. Ask me anything.")).toBe(false);
  });

  it("treats an empty or tiny string as not Chinese", () => {
    expect(looksChinese("")).toBe(false);
    expect(looksChinese("好")).toBe(false);
  });
});

describe("smoothForSpeech", () => {
  it("drops wrapping quotes, which are read as a pause", () => {
    expect(smoothForSpeech('"大家好，我是房地产经纪人。"')).toBe("大家好，我是房地产经纪人。");
    expect(smoothForSpeech("“大家好。”")).toBe("大家好。");
  });

  it("turns an enumeration chain into flowing commas", () => {
    // Four 、 in a row is what made the delivery staccato.
    const out = smoothForSpeech("好学区、好环境、好产品、好配套，四重优势的项目。");
    expect(out).not.toContain("、");
    expect(out).toBe("好学区，好环境，好产品，好配套，四重优势的项目。");
  });

  it("does not leave doubled commas behind", () => {
    expect(smoothForSpeech("好学区、，好环境")).toBe("好学区，好环境");
  });

  it("leaves ordinary sentences alone", () => {
    const s = "大家好，我是专门做洛杉矶房地产的。欢迎随时联系我。";
    expect(smoothForSpeech(s)).toBe(s);
  });

  it("leaves English untouched apart from trimming", () => {
    expect(smoothForSpeech("  Hi, I'm your agent.  ")).toBe("Hi, I'm your agent.");
  });

  it("is idempotent", () => {
    const once = smoothForSpeech('"好学区、好环境、好配套。"');
    expect(smoothForSpeech(once)).toBe(once);
  });
});

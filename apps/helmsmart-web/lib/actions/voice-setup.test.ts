/**
 * Getting a number that answers — the actions behind the three paths.
 *
 * THE RETELL CLIENT IS STUBBED IN EVERY TEST HERE, DELIBERATELY AND TOTALLY.
 * `provisionNumber` buys a real phone line and `importExistingNumber` moves a
 * real one; a test that reached the provider would spend money and could
 * repoint a production number at a test agent. Nothing in this file may ever
 * call the network, so `@/lib/retell` is mocked at module scope and each test
 * asserts against the recorded calls instead.
 *
 * What is covered: buying succeeds and records the number, buying fails and
 * records nothing, import validates before it touches the provider, the repair
 * path repairs only what it can, and — the reason any of this exists — a role
 * without `settings.write` cannot spend the account's money.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

// ─── The provider, entirely in memory ───────────────────────────────────────

const retell = {
  createRetellNumber: vi.fn(),
  importRetellNumber: vi.fn(),
  getRetellNumber: vi.fn(),
  updateRetellNumber: vi.fn(),
};
vi.mock("@/lib/retell", () => ({
  createRetellNumber: (...a: unknown[]) => retell.createRetellNumber(...a),
  importRetellNumber: (...a: unknown[]) => retell.importRetellNumber(...a),
  getRetellNumber: (...a: unknown[]) => retell.getRetellNumber(...a),
  updateRetellNumber: (...a: unknown[]) => retell.updateRetellNumber(...a),
}));

// ─── Everything else the module reaches ─────────────────────────────────────

let permissionDenial: { ok: false; error: string } | null = null;
vi.mock("@/components/role-guard", () => ({
  checkActionPermission: async () => permissionDenial,
}));

let orgRow: { id: string; name: string; twilio_number: string | null } | null = null;
vi.mock("@/lib/auth/org-context", () => ({
  getMemberOrgId: async () => orgRow?.id ?? null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: orgRow }) }) }),
    }),
  }),
}));

const updateOrg = vi.fn();
vi.mock("@/lib/actions/org-update", () => ({
  updateOrg: (...a: unknown[]) => updateOrg(...a),
}));

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "voice") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import {
  provisionNumber,
  importExistingNumber,
  verifyNumberWiring,
  rebindNumber,
} from "@/lib/actions/voice-setup";

// Named `voiceT`, not `t`: a bare `t("errors.…")` beside a `getServerT` mock is
// what lib/i18n/__tests__/serverNamespace.test.ts looks for, and it is right to.
const voiceT = translatorFor("en", "voice");
const AGENT = "agent_test_0001";
const WEBHOOK_BASE = "https://www.example-helm.test/api/retell/inbound";

beforeEach(() => {
  vi.clearAllMocks();
  permissionDenial = null;
  orgRow = { id: "org-1", name: "Acme Plumbing", twilio_number: null };
  updateOrg.mockResolvedValue({ ok: true });
  process.env.RETELL_API_KEY = "key_test";
  process.env.RETELL_FUNCTION_SECRET = "secret_test";
  process.env.RETELL_AGENT_ID = AGENT;
  process.env.NEXT_PUBLIC_APP_URL = "https://www.example-helm.test";
});

/* ─── Path a: buy a number ────────────────────────────────────────────────── */

describe("provisionNumber", () => {
  it("buys the number, binds it to the agent and the inbound webhook, and records it", async () => {
    retell.createRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });

    const res = await provisionNumber({ areaCode: "626" });

    expect(res).toEqual({ ok: true, number: "+16265550147" });

    // The binding is the whole point — a bought number that is not attached to
    // the agent with the webhook pointed here is the bug, not the fix.
    const args = retell.createRetellNumber.mock.calls[0][0];
    expect(args.areaCode).toBe(626);
    expect(args.agentId).toBe(AGENT);
    expect(args.inboundWebhookUrl.startsWith(WEBHOOK_BASE)).toBe(true);
    expect(args.inboundWebhookUrl).toContain("k=secret_test");

    expect(updateOrg).toHaveBeenCalledWith("org-1", { twilio_number: "+16265550147" }, "storeNumber");
  });

  it("spends nothing on an area code that isn't one", async () => {
    const res = await provisionNumber({ areaCode: "1" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(voiceT("errors.invalidAreaCode"));
    expect(retell.createRetellNumber).not.toHaveBeenCalled();
  });

  it("refuses a second number rather than quietly buying one the org can't route", async () => {
    orgRow = { id: "org-1", name: "Acme Plumbing", twilio_number: "+16265550147" };
    const res = await provisionNumber({ areaCode: "626" });
    expect(res.error).toBe(voiceT("errors.alreadyHasNumber"));
    expect(retell.createRetellNumber).not.toHaveBeenCalled();
  });

  it("reports the provider's failure instead of claiming a number", async () => {
    retell.createRetellNumber.mockRejectedValue(new Error("Retell /create-phone-number failed (402): no funds"));
    const res = await provisionNumber({ areaCode: "626" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("402");
    expect(updateOrg).not.toHaveBeenCalled();
  });

  it("surfaces a number that was bought but could not be recorded — money is already spent", async () => {
    retell.createRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });
    updateOrg.mockResolvedValue({ ok: false, error: "row not updated" });

    const res = await provisionNumber({ areaCode: "626" });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("+16265550147");
  });

  it("is refused outright for a role that can't change settings", async () => {
    // Buying a number spends the account's money, so it is owner/admin work.
    permissionDenial = { ok: false, error: "You don't have permission to do that." };
    const res = await provisionNumber({ areaCode: "626" });
    expect(res).toEqual(permissionDenial);
    expect(retell.createRetellNumber).not.toHaveBeenCalled();
    expect(updateOrg).not.toHaveBeenCalled();
  });
});

/* ─── Path c: import a Twilio number you own ──────────────────────────────── */

describe("importExistingNumber", () => {
  const good = {
    phoneNumber: "+16265550147",
    terminationUri: "yourtrunk.pstn.twilio.com",
    sipUser: "acme",
    sipPass: "hunter2",
  };

  it("imports and wires it to the agent + webhook", async () => {
    retell.importRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });

    const res = await importExistingNumber(good);

    expect(res).toEqual({ ok: true, number: "+16265550147" });
    const args = retell.importRetellNumber.mock.calls[0][0];
    expect(args.agentId).toBe(AGENT);
    expect(args.inboundWebhookUrl.startsWith(WEBHOOK_BASE)).toBe(true);
    expect(args.terminationUri).toBe("yourtrunk.pstn.twilio.com");
    expect(updateOrg).toHaveBeenCalledWith("org-1", { twilio_number: "+16265550147" }, "storeNumber");
  });

  it("validates the phone number before touching the provider", async () => {
    const res = await importExistingNumber({ ...good, phoneNumber: "not a number" });
    expect(res.ok).toBe(false);
    expect(retell.importRetellNumber).not.toHaveBeenCalled();
  });

  it("insists on a termination URI — without it the trunk cannot reach us", async () => {
    const res = await importExistingNumber({ ...good, terminationUri: "   " });
    expect(res.error).toBe(voiceT("errors.terminationUriRequired"));
    expect(retell.importRetellNumber).not.toHaveBeenCalled();
  });

  it("treats blank SIP credentials as absent, not as empty strings", async () => {
    retell.importRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });
    await importExistingNumber({ ...good, sipUser: "  ", sipPass: "" });
    const args = retell.importRetellNumber.mock.calls[0][0];
    expect(args.sipUser).toBeUndefined();
    expect(args.sipPass).toBeUndefined();
  });

  it("is refused for a role that can't change settings", async () => {
    permissionDenial = { ok: false, error: "You don't have permission to do that." };
    const res = await importExistingNumber(good);
    expect(res).toEqual(permissionDenial);
    expect(retell.importRetellNumber).not.toHaveBeenCalled();
  });
});

/* ─── The check every screen now reads ────────────────────────────────────── */

describe("verifyNumberWiring", () => {
  beforeEach(() => {
    orgRow = { id: "org-1", name: "Acme Plumbing", twilio_number: "+16265550147" };
  });

  it("passes only when the provider has the number, our agent and our webhook", async () => {
    retell.getRetellNumber.mockResolvedValue({
      found: true,
      inboundWebhookUrl: `${WEBHOOK_BASE}?k=secret_test`,
      agentIds: [AGENT],
    });
    expect(await verifyNumberWiring()).toMatchObject({ ok: true, numberFound: true, webhookOk: true, agentOk: true });
  });

  it("mode 1 — the provider does not have the number", async () => {
    retell.getRetellNumber.mockResolvedValue({ found: false, inboundWebhookUrl: null, agentIds: [] });
    expect(await verifyNumberWiring()).toMatchObject({ ok: false, numberFound: false });
  });

  it("mode 2 — the number is bound to somebody else's agent", async () => {
    retell.getRetellNumber.mockResolvedValue({
      found: true,
      inboundWebhookUrl: `${WEBHOOK_BASE}?k=secret_test`,
      agentIds: ["agent_someone_else"],
    });
    expect(await verifyNumberWiring()).toMatchObject({ ok: false, numberFound: true, webhookOk: true, agentOk: false });
  });

  it("mode 3 — the inbound webhook points at another host", async () => {
    // The shape a domain move leaves behind: the number is ours, the agent is
    // ours, and every call is POSTed to a host that no longer serves this app.
    retell.getRetellNumber.mockResolvedValue({
      found: true,
      inboundWebhookUrl: "https://old-host.example/api/retell/inbound?k=secret_test",
      agentIds: [AGENT],
    });
    expect(await verifyNumberWiring()).toMatchObject({ ok: false, numberFound: true, webhookOk: false, agentOk: true });
  });

  it("says there is no number rather than reporting a healthy nothing", async () => {
    orgRow = { id: "org-1", name: "Acme Plumbing", twilio_number: null };
    const res = await verifyNumberWiring();
    expect(res.ok).toBe(false);
    expect(res.error).toBe(voiceT("errors.noNumberConnected"));
  });

  it("an unset API key is reported as an error, never as a wired number", async () => {
    delete process.env.RETELL_API_KEY;
    const res = await verifyNumberWiring();
    expect(res.ok).toBe(false);
    expect(res.error).toBe(voiceT("errors.missingApiKey"));
  });
});

/* ─── The fix offered next to the failure ─────────────────────────────────── */

describe("rebindNumber", () => {
  beforeEach(() => {
    orgRow = { id: "org-1", name: "Acme Plumbing", twilio_number: "+16265550147" };
  });

  it("re-points a number the provider holds at our agent and webhook", async () => {
    retell.getRetellNumber.mockResolvedValue({ found: true, inboundWebhookUrl: null, agentIds: [] });
    retell.updateRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });

    const res = await rebindNumber();

    expect(res.ok).toBe(true);
    const args = retell.updateRetellNumber.mock.calls[0][0];
    expect(args.phoneNumber).toBe("+16265550147");
    expect(args.agentId).toBe(AGENT);
    expect(args.inboundWebhookUrl.startsWith(WEBHOOK_BASE)).toBe(true);
  });

  it("buys nothing, ever — repair is not provisioning", async () => {
    retell.getRetellNumber.mockResolvedValue({ found: true, inboundWebhookUrl: null, agentIds: [] });
    retell.updateRetellNumber.mockResolvedValue({ phoneNumber: "+16265550147" });
    await rebindNumber();
    expect(retell.createRetellNumber).not.toHaveBeenCalled();
    expect(retell.importRetellNumber).not.toHaveBeenCalled();
  });

  it("declines a number the provider has never heard of, and says why", async () => {
    retell.getRetellNumber.mockResolvedValue({ found: false, inboundWebhookUrl: null, agentIds: [] });
    const res = await rebindNumber();
    expect(res.ok).toBe(false);
    expect(res.error).toBe(voiceT("errors.cannotRebindUnknown"));
    expect(retell.updateRetellNumber).not.toHaveBeenCalled();
  });

  it("is refused for a role that can't change settings", async () => {
    permissionDenial = { ok: false, error: "You don't have permission to do that." };
    const res = await rebindNumber();
    expect(res).toEqual(permissionDenial);
    expect(retell.getRetellNumber).not.toHaveBeenCalled();
  });
});

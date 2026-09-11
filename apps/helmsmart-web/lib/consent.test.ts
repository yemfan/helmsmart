/**
 * The app side of consent: loading every source, recording STOP / START /
 * carrier refusals, and the sentence the owner reads when a send is refused.
 */
import { describe, expect, it } from "vitest";
import { OPT_OUT_REASON, decideConsent, type ConsentDenied } from "@helm/dna-communication";
import { translatorFor } from "@/lib/i18n/translator";
import {
  clearSmsOptOut,
  describeDenial,
  inputsFor,
  loadConsent,
  loadOrgOptOuts,
  optOutState,
  recordSmsOptOut,
  type LoadedConsent,
} from "./consent";
import { fakeSupabase } from "./__tests__/fake-supabase";

const ORG = "org-1";
const SEP_3 = "2026-09-03T15:00:00.000Z";

const priya = {
  id: "c1",
  organization_id: ORG,
  first_name: "Priya",
  last_name: "Patel",
  phone: "(626) 555-0101",
  email: "priya@example.com",
};

describe("loadConsent", () => {
  it("reads all three sources for a client, matching the number however it was typed", async () => {
    const { db } = fakeSupabase({
      clients: [priya],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_email: true }],
      sms_unsubscribes: [
        { organization_id: ORG, phone_number: "+16265550101", unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply },
      ],
      email_unsubscribes: [],
    });
    const c = await loadConsent(db, ORG, { clientId: "c1" });
    expect(c.client?.first_name).toBe("Priya");
    expect(c.inputs.preferences?.opted_out_email).toBe(true);
    expect(c.inputs.smsUnsubscribe?.reason).toBe(OPT_OUT_REASON.stopReply);
    expect(decideConsent("sms", "conversation", c.inputs).allowed).toBe(false);
    expect(decideConsent("email", "conversation", c.inputs).allowed).toBe(false);
    expect(decideConsent("call", "automated", c.inputs).allowed).toBe(true);
  });

  it("finds the client behind an unmatched thread's number", async () => {
    const { db } = fakeSupabase({
      clients: [priya],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }],
    });
    const c = await loadConsent(db, ORG, { phone: "+16265550101" });
    expect(c.client?.id).toBe("c1");
    expect(decideConsent("sms", "automated", c.inputs).allowed).toBe(false);
  });

  it("checks the unsubscribe tables by address even when nobody is a client", async () => {
    const { db } = fakeSupabase({
      email_unsubscribes: [{ organization_id: ORG, email: "stranger@example.com", unsubscribed_at: SEP_3 }],
    });
    const c = await loadConsent(db, ORG, { email: "Stranger@Example.com" });
    expect(c.client).toBeNull();
    expect(decideConsent("email", "automated", c.inputs).allowed).toBe(false);
  });

  it("does not let another organization's opt-out leak across", async () => {
    const { db } = fakeSupabase({
      clients: [priya],
      sms_unsubscribes: [{ organization_id: "org-2", phone_number: "+16265550101", unsubscribed_at: SEP_3 }],
    });
    const c = await loadConsent(db, ORG, { clientId: "c1" });
    expect(decideConsent("sms", "conversation", c.inputs).allowed).toBe(true);
  });

  it("throws when a table can't be read, so callers fail closed", async () => {
    const { db } = fakeSupabase({ clients: [priya] });
    const broken = {
      from: (t: string) =>
        t === "sms_unsubscribes"
          ? { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) }
          : db.from(t),
    };
    await expect(loadConsent(broken as never, ORG, { clientId: "c1" })).rejects.toThrow(/consent/);
  });
});

describe("recordSmsOptOut / clearSmsOptOut — STOP and START", () => {
  it("STOP writes the unsubscribe and switches every matching client", async () => {
    const f = fakeSupabase({ clients: [priya, { ...priya, id: "c2", phone: "626-555-0101" }] });
    await recordSmsOptOut(f.db, ORG, "+16265550101", OPT_OUT_REASON.stopReply);
    expect(f.rows("sms_unsubscribes")).toEqual([
      expect.objectContaining({ organization_id: ORG, phone_number: "+16265550101", reason: "stop_keyword" }),
    ]);
    const prefs = f.rows("communication_preferences");
    expect(prefs.map((p) => p.client_id).sort()).toEqual(["c1", "c2"]);
    expect(prefs.every((p) => p.opted_out_sms === true)).toBe(true);
  });

  it("a second STOP keeps the first date", async () => {
    const f = fakeSupabase({
      clients: [priya],
      sms_unsubscribes: [{ organization_id: ORG, phone_number: "+16265550101", unsubscribed_at: SEP_3, reason: "stop_keyword" }],
    });
    await recordSmsOptOut(f.db, ORG, "+16265550101", OPT_OUT_REASON.stopReply);
    expect(f.rows("sms_unsubscribes")).toHaveLength(1);
    expect(f.rows("sms_unsubscribes")[0].unsubscribed_at).toBe(SEP_3);
  });

  it("START clears the unsubscribe and the switch", async () => {
    const f = fakeSupabase({
      clients: [priya],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true, opted_out_email: true }],
      sms_unsubscribes: [{ organization_id: ORG, phone_number: "+16265550101", unsubscribed_at: SEP_3 }],
    });
    await clearSmsOptOut(f.db, ORG, "+16265550101");
    expect(f.rows("sms_unsubscribes")).toEqual([]);
    expect(f.rows("communication_preferences")[0]).toMatchObject({ opted_out_sms: false, opted_out_email: true });
  });
});

describe("bulk opt-outs", () => {
  it("matches an unsubscribe typed one way against a client phone typed another", async () => {
    const { db } = fakeSupabase({
      sms_unsubscribes: [{ organization_id: ORG, phone_number: "(626) 555-0103", unsubscribed_at: SEP_3 }],
      communication_preferences: [{ organization_id: ORG, client_id: "c9", opted_out_calls: true }],
    });
    const all = await loadOrgOptOuts(db, ORG);
    expect(decideConsent("sms", "marketing", inputsFor(all, { clientId: "c3", phone: "+16265550103" })).allowed).toBe(false);
    expect(decideConsent("sms", "marketing", inputsFor(all, { clientId: "c4", phone: "+16265550104" })).allowed).toBe(true);
    expect(decideConsent("call", "automated", inputsFor(all, { clientId: "c9" })).allowed).toBe(false);
  });
});

describe("describeDenial", () => {
  const consentFor = (inputs: LoadedConsent["inputs"]): LoadedConsent => ({
    client: { id: "c1", first_name: "Priya", last_name: "Patel", phone: "+16265550101", email: "priya@example.com" },
    phone: "+16265550101",
    email: "priya@example.com",
    inputs,
  });

  it("reads like the example in the brief", () => {
    const inputs = { smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply } };
    const d = decideConsent("sms", "conversation", inputs) as ConsentDenied;
    expect(describeDenial(d, consentFor(inputs), translatorFor("en", "clients"), "en")).toBe(
      "Priya Patel opted out of text messages on Sep 3 (replied STOP). You can still email Priya.",
    );
  });

  it("offers no alternative that is also closed", () => {
    const inputs = { preferences: { opted_out_sms: true, opted_out_email: true } };
    const d = decideConsent("sms", "conversation", inputs) as ConsentDenied;
    expect(describeDenial(d, consentFor(inputs), translatorFor("en", "clients"), "en")).toBe(
      "Priya Patel is marked as opted out of text messages.",
    );
  });

  it("offers both open channels for a refused call", () => {
    const inputs = { preferences: { opted_out_calls: true } };
    const d = decideConsent("call", "automated", inputs) as ConsentDenied;
    expect(describeDenial(d, consentFor(inputs), translatorFor("en", "clients"), "en")).toBe(
      "Priya Patel is marked as opted out of phone calls. You can still text or email Priya.",
    );
  });

  it("names nobody it does not know", () => {
    const d = decideConsent("sms", "automated", {
      smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.carrier },
    }) as ConsentDenied;
    expect(describeDenial(d, null, translatorFor("en", "clients"), "en")).toBe(
      "This contact opted out of text messages on Sep 3 (their carrier reported a STOP reply).",
    );
  });

  it("renders every denial in every locale, with no raw key or unfilled slot", () => {
    const cases: LoadedConsent["inputs"][] = [
      { smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply } },
      { smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.carrier } },
      { smsUnsubscribe: { unsubscribed_at: SEP_3, reason: "manual" } },
      { preferences: { opted_out_sms: true } },
      { emailUnsubscribe: { unsubscribed_at: SEP_3 } },
      { preferences: { opted_out_email: true } },
      { preferences: { opted_out_calls: true } },
    ];
    for (const locale of ["en", "es", "zh-Hans"]) {
      const t = translatorFor(locale, "clients");
      for (const inputs of cases) {
        for (const channel of ["sms", "email", "call"] as const) {
          const d = decideConsent(channel, "automated", inputs);
          if (d.allowed) continue;
          for (const consent of [consentFor(inputs), null]) {
            const text = describeDenial(d, consent, t, locale);
            expect(text, `${locale} ${channel}`).not.toMatch(/consent\.|\{\{/);
            expect(text.length).toBeGreaterThan(10);
            if (locale === "zh-Hans") expect(text).toMatch(/[一-鿿]/);
          }
        }
      }
    }
  });
});

describe("optOutState — what the client page's switches show", () => {
  it("is on for any source, with how and when", () => {
    const s = optOutState({
      smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply },
      preferences: { opted_out_calls: true },
    });
    expect(s.sms).toEqual({ optedOut: true, via: "stop_reply", since: SEP_3 });
    expect(s.email).toEqual({ optedOut: false, via: null, since: null });
    expect(s.call).toEqual({ optedOut: true, via: "marked", since: null });
  });
});

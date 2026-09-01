import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emailSuppression,
  isEmailSuppressed,
  mailingAddress,
  unsubscribeHeaders,
  unsubscribeMailto,
  unsubscribeUrl,
  withUnsubscribeFooter,
} from "@/lib/email/unsubscribe";

const TOKEN = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("emailSuppression", () => {
  it("lets a contact with an address and no flags through", () => {
    expect(emailSuppression({ email: "a@b.com" })).toBeNull();
    expect(isEmailSuppressed({ email: "a@b.com" })).toBe(false);
  });

  it("honours the CONTACT's own opt-out", () => {
    expect(emailSuppression({ email: "a@b.com", contact_opt_out_email: true })).toBe(
      "contact_opted_out",
    );
  });

  it("honours the AGENT's do-not-contact", () => {
    expect(emailSuppression({ email: "a@b.com", do_not_contact_email: true })).toBe(
      "agent_do_not_contact",
    );
  });

  it("reads BOTH flags — checking one is how an unsubscribed contact keeps getting mail", () => {
    // These are different actors. The drip rail read neither and the drafts
    // sender read only the agent's, so an unsubscribe via the footer link did
    // not stop approved drafts.
    expect(isEmailSuppressed({ email: "a@b.com", contact_opt_out_email: true })).toBe(true);
    expect(isEmailSuppressed({ email: "a@b.com", do_not_contact_email: true })).toBe(true);
  });

  it("reports the reason, because 'we did not email' and 'they said stop' differ", () => {
    expect(emailSuppression({ email: "" })).toBe("no_email");
    expect(emailSuppression({ email: "   " })).toBe("no_email");
    expect(emailSuppression(null)).toBe("no_email");
    expect(emailSuppression(undefined)).toBe("no_email");
  });

  it("treats a null flag as not-set rather than opted-out", () => {
    expect(
      emailSuppression({ email: "a@b.com", contact_opt_out_email: null, do_not_contact_email: null }),
    ).toBeNull();
  });
});

describe("unsubscribeUrl", () => {
  it("builds a one-click URL carrying the token", () => {
    expect(unsubscribeUrl(TOKEN)).toContain("/api/email/unsubscribe?token=");
    expect(unsubscribeUrl(TOKEN)).toContain(TOKEN);
  });

  it("is null without a token — a dead link is worse than none", () => {
    // A link that cannot identify anyone still LOOKS like a working opt-out.
    expect(unsubscribeUrl(null)).toBeNull();
    expect(unsubscribeUrl("")).toBeNull();
    expect(unsubscribeUrl("   ")).toBeNull();
  });
});

describe("unsubscribeHeaders", () => {
  it("emits the RFC 8058 pair that gives Gmail its native button", () => {
    const h = unsubscribeHeaders(TOKEN);
    expect(h["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/api\/email\/unsubscribe\?token=.+>, <mailto:.+>$/);
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("emits nothing without a token", () => {
    // Advertising one-click and not honouring it is worse than not advertising
    // it — providers measure whether the button actually works.
    expect(unsubscribeHeaders(null)).toEqual({});
  });
});

describe("withUnsubscribeFooter", () => {
  const base = { html: "<p>Hi</p>", text: "Hi" };

  it("adds a visible link to both bodies, not just the header", () => {
    const out = withUnsubscribeFooter({ ...base, token: TOKEN, senderName: "Michael Ye" });
    expect(out.html).toContain("Unsubscribe");
    expect(out.html).toContain("/api/email/unsubscribe?token=");
    expect(out.text).toContain("Unsubscribe: ");
    // The original body survives.
    expect(out.html).toContain("<p>Hi</p>");
    expect(out.text.startsWith("Hi")).toBe(true);
  });

  it("carries the CAN-SPAM essentials: why they got it and a postal address", () => {
    const out = withUnsubscribeFooter({ ...base, token: TOKEN, senderName: "Michael Ye" });
    expect(out.text).toContain("you enquired with Michael Ye");
    expect(out.text).toContain(mailingAddress());
  });

  it("still reads sensibly with no sender name", () => {
    const out = withUnsubscribeFooter({ ...base, token: TOKEN });
    expect(out.text).toContain("you enquired with us");
  });

  it("leaves the bodies untouched without a token", () => {
    const out = withUnsubscribeFooter({ ...base, token: null });
    expect(out).toEqual(base);
  });

  it("escapes the sender name rather than injecting it into the markup", () => {
    const out = withUnsubscribeFooter({
      ...base,
      token: TOKEN,
      senderName: '<script>alert(1)</script>',
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});

describe("environment fallbacks", () => {
  const KEYS = [
    "OUTREACH_MAILING_ADDRESS",
    "NEWSLETTER_MAILING_ADDRESS",
    "OUTREACH_UNSUBSCRIBE_MAILTO",
    "NEWSLETTER_UNSUBSCRIBE_MAILTO",
    "RESEND_REPLY_TO",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("makes an unset postal address obvious instead of shipping a blank footer", () => {
    // A missing value must show up in the first test send, not go out to real
    // people as an empty (and distinctly spammy) footer.
    expect(mailingAddress()).toContain("set OUTREACH_MAILING_ADDRESS");
  });

  it("prefers the outreach-specific address over the newsletter's", () => {
    process.env.NEWSLETTER_MAILING_ADDRESS = "Newsletter Addr";
    process.env.OUTREACH_MAILING_ADDRESS = "Outreach Addr";
    expect(mailingAddress()).toBe("Outreach Addr");
  });

  it("falls back to the newsletter's settings before the hardcoded default", () => {
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO = "stop@example.com";
    expect(unsubscribeMailto()).toBe("stop@example.com");
  });

  it("always yields some mailto, so the header's second arm is never empty", () => {
    expect(unsubscribeMailto()).toMatch(/@/);
  });

  it("defaults to a mailbox that actually receives", () => {
    // `unsubscribe@closebossai.com` does not exist. Defaulting to it meant
    // opt-outs sent to the mailto arm bounced instead of being honoured —
    // worse than offering no mailto at all, because the recipient believes
    // they unsubscribed and reports spam when the next message arrives.
    // `contact@` is the only mailbox on this domain that receives.
    expect(unsubscribeMailto()).toBe("contact@closebossai.com");
  });
});

import { describe, expect, it } from "vitest";

import { leafKeys, loadNamespaces, lookup } from "./bundles";

/**
 * Chinese makes you choose, on every sentence, how formally to address the
 * reader: 你 or 您. English does not, so a translator picks per string and
 * nothing downstream ever compares two of them.
 *
 * HelmSmart shipped both. The marketing site, Home and the login screen said
 * 你 — 104, 16 and 24 uses — while Settings, Workflows, Voice and the
 * permission errors said 您. Same person, same session, two registers: a
 * Chinese reader hears it as two different products, or as one that cannot
 * decide how well it knows them. No guard could see it, because every string
 * involved is a correct translation of its English source. Only the SET is
 * wrong.
 *
 * THE RULE IS NOT "PICK ONE". Who the second person addresses decides it:
 *
 *   - the OWNER, reading their own dashboard          -> 你, matching the
 *     marketing voice they arrived through ("让你专注于自己热爱的工作")
 *   - the owner's CUSTOMER — a caller hearing the AI receptionist, a client
 *     reading a campaign email, a visitor on a public form                -> 您
 *
 * That second case is the whole reason this is an allowlist rather than a ban.
 * `voice.settings.greeting.placeholder` is what a caller hears when the phone
 * is answered; addressing a stranger as 你 there would be rude in a way the
 * English original ("Hello! Thank you for calling.") gives no hint of. The
 * setting that CONFIGURES that greeting is owner-facing and says 你. The two
 * sit in the same file, and both are right.
 *
 * A new 您 is therefore not an error — it is a claim that the string is read by
 * a customer. Making that claim explicit here is the point.
 *
 * THE PACKAGE HALF IS A DIFFERENT PRODUCT. `common` resolves through
 * `packages/i18n/locales/zh-Hans/`, which CloseBoss and the mobile app also
 * read — and that bundle is 您 by a factor of eight (1904 to 225). CloseBoss
 * addresses its agents formally on purpose; that is its voice, not a bug, and
 * flipping a shared string to suit HelmSmart would change a sentence in a
 * product nobody asked us to touch. This guard runs over the RESOLVED bundle,
 * so it sees the package half too — and the fix when it catches one there is an
 * override in `messages/zh-Hans/common.json`, which the deep overlay in
 * `config.ts` supports and which leaves CloseBoss alone. `offline.title` is
 * exactly that: 您已离线 in the package, 你已离线 here.
 */

/** Keys whose second person addresses the owner's CUSTOMER, not the owner. */
const CUSTOMER_FACING: Record<string, string> = {
  "voice:settings.greeting.placeholder":
    "what the CALLER hears when the receptionist answers",
  "voice:outbound.surveyPlaceholder":
    "the AI asking a customer to rate the service they received",
  "voice:outbound.promoPlaceholder": "the AI offering a customer a booking",
  "marketing:campaigns.detail.greeting":
    "the greeting line of a campaign email, addressed to the client",
  "marketing:campaigns.form.bodyPlaceholder":
    "a draft email TO a client; the owner edits it, the client reads it",
  "marketing:google.reply.placeholder":
    "a public reply to a reviewer, read by everyone who reads the review",
  "marketing:publicForm.redirecting":
    "shown to the visitor submitting a public lead form",
  /*
   * The confirmation emails the public contact and sales forms send back. The
   * reader is a VISITOR who has not signed up for anything — the same stranger
   * as the receptionist's caller, one channel over. The notification that goes
   * to the HelmSmart team about the same submission is English and never
   * appears here, which is the distinction this list exists to record.
   */
  "site:contact.confirmationEmail.subject": "emailed to the visitor who used the contact form",
  "site:contact.confirmationEmail.heading": "emailed to the visitor who used the contact form",
  "site:contact.confirmationEmail.greeting": "emailed to the visitor who used the contact form",
  "site:contact.confirmationEmail.body": "emailed to the visitor who used the contact form",
  "site:sales.confirmationEmail.subject": "emailed to the visitor who asked about pricing",
  "site:sales.confirmationEmail.heading": "emailed to the visitor who asked about pricing",
  "site:sales.confirmationEmail.greeting": "emailed to the visitor who asked about pricing",
  "site:sales.confirmationEmail.body": "emailed to the visitor who asked about pricing",
};

const FORMAL = "您";

function formalKeys(): string[] {
  const out: string[] = [];
  const bundles = loadNamespaces("zh-Hans");
  for (const [ns, bundle] of Object.entries(bundles)) {
    for (const key of leafKeys(bundle)) {
      const value = lookup(bundle, key);
      if (typeof value === "string" && value.includes(FORMAL)) out.push(`${ns}:${key}`);
    }
  }
  return out.sort();
}

describe("Chinese register", () => {
  it("addresses the owner as 你 everywhere except copy their customer reads", () => {
    const unexplained = formalKeys().filter((k) => !(k in CUSTOMER_FACING));

    expect(
      unexplained,
      `\nThese zh-Hans strings use 您 (formal) but are not listed as customer-facing:\n\n` +
        `${unexplained.join("\n")}\n\n` +
        `The owner's own dashboard says 你 — see the marketing copy they arrived\n` +
        `through. Either change 您 to 你, or, if a CUSTOMER reads this string,\n` +
        `add it to CUSTOMER_FACING with the reader named.\n`,
    ).toEqual([]);
  });

  it("keeps the customer-facing list honest", () => {
    // An entry for a key that no longer says 您 is a comment pretending to be a
    // rule, and it hides the next real drift behind a stale name.
    const actual = new Set(formalKeys());
    const stale = Object.keys(CUSTOMER_FACING).filter((k) => !actual.has(k));
    expect(
      stale,
      `\nCUSTOMER_FACING lists keys that no longer use 您:\n${stale.join("\n")}\n`,
    ).toEqual([]);
  });

  it("still says 您 where a customer is listening", () => {
    // The inverse failure: someone runs a find-and-replace over the bundle and
    // the receptionist starts addressing strangers as 你.
    const bundles = loadNamespaces("zh-Hans");
    const greeting = lookup(bundles.voice, "settings.greeting.placeholder");
    expect(greeting, "the receptionist's greeting to a caller").toContain(FORMAL);
  });

  it("finds a plausible amount of Chinese to check", () => {
    // If the loader stops resolving, every assertion above passes over an empty
    // set and this guard goes green while the bundles drift.
    const bundles = loadNamespaces("zh-Hans");
    const chinese = Object.values(bundles).flatMap((b) =>
      leafKeys(b).filter((k) => {
        const v = lookup(b, k);
        return typeof v === "string" && /[一-鿿]/.test(v);
      }),
    );
    expect(chinese.length).toBeGreaterThan(2000);
  });
});

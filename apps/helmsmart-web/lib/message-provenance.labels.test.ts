/**
 * Every value `messages.sent_by` can hold has a name in every language, and an
 * unknown or missing value reads "You" — what every outbound row said before
 * the column existed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translatorFor } from "@/lib/i18n/translator";
import { MESSAGE_SENDERS, SENDER_LABEL_KEYS, SENDER_LABEL_NS, senderLabel } from "./message-provenance";

const MESSAGES = join(__dirname, "..", "messages");

function lookup(bundle: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

describe("sender labels", () => {
  for (const locale of ["en", "es", "zh-Hans"]) {
    it(`every sender has a label in ${locale}/${SENDER_LABEL_NS}.json`, () => {
      const bundle = JSON.parse(readFileSync(join(MESSAGES, locale, `${SENDER_LABEL_NS}.json`), "utf8"));
      const missing = MESSAGE_SENDERS.filter((s) => typeof lookup(bundle, SENDER_LABEL_KEYS[s]) !== "string");
      expect(missing).toEqual([]);
    });
  }

  it("names what sent it", () => {
    const t = translatorFor("en", "inbox");
    expect(senderLabel("auto_pilot", t)).toBe("Auto Pilot");
    expect(senderLabel("reminder", t)).toBe("Automatic reminder");
    expect(senderLabel("missed_call_text", t)).toBe("Missed-call text");
    expect(senderLabel("auto_reply", t)).toBe("Auto-reply");
    expect(senderLabel("receptionist", t)).toBe("AI receptionist");
  });

  it("reads 'You' for a person, a null, and a value it does not know", () => {
    const t = translatorFor("en", "inbox");
    expect(senderLabel("person", t)).toBe("You");
    expect(senderLabel(null, t)).toBe("You");
    expect(senderLabel("campaign", t)).toBe("You");
  });

  // The AI panel's `t` is bound to `home`. It used to keep its own copy of
  // these names there, and the copies had already drifted apart in Spanish.
  for (const locale of ["en", "es", "zh-Hans"]) {
    it(`reads the same words from a translator bound to another namespace (${locale})`, () => {
      const inbox = translatorFor(locale, "inbox");
      const home = translatorFor(locale, "home");
      for (const s of MESSAGE_SENDERS) {
        expect(senderLabel(s, home)).toBe(senderLabel(s, inbox));
        expect(senderLabel(s, home)).not.toContain("provenance.");
      }
    });
  }
});

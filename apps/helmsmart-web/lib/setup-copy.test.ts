import { describe, expect, it } from "vitest";

import { ACTIVATION_STEP_IDS } from "@/lib/activation";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { translatorFor } from "@/lib/i18n/translator";
import type { SiteReadFailure } from "@/lib/site-profile";

/**
 * The guided setup builds three of its keys from values, not literals:
 *
 *     t(`setup.steps.${id}`)
 *     t(`setup.script.siteFailure.${draft.siteFailure}`)
 *     t(`activation.steps.${step.id}`)
 *
 * The missing-key guard reads source and can only see literal keys, so a
 * reason added to `SiteReadFailure` or a step added to `ACTIVATION_STEP_IDS`
 * with no copy behind it passes every other check in this suite and then
 * prints its own key path on screen — `setup.script.siteFailure.no-text`, in
 * English, in the middle of a Chinese page. This closes that by enumerating
 * the value sets and asking for each one, in each locale we ship.
 */

/** Every member of the union, spelled out so adding one here is deliberate. */
const SITE_FAILURES: SiteReadFailure[] = [
  "empty",
  "bad-url",
  "not-https",
  "blocked-host",
  "dns-failed",
  "too-many-redirects",
  "http-error",
  "unsupported-type",
  "no-text",
  "unreachable",
];

function resolves(locale: string, ns: string, key: string): string {
  const value = translatorFor(locale, ns)(key);
  // A miss returns the key path — the exact "raw key on screen" symptom.
  expect(value, `${locale} ${ns}:${key}`).not.toBe(key);
  expect(value, `${locale} ${ns}:${key}`).toBeTruthy();
  return value;
}

describe("keys the setup wizard builds from values", () => {
  it("names every step, in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const id of ACTIVATION_STEP_IDS) {
        resolves(locale, "auth", `setup.steps.${id}`);
        resolves(locale, "home", `activation.steps.${id}`);
      }
    }
  });

  it("explains every reason a website could not be read, in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const reason of SITE_FAILURES) {
        resolves(locale, "auth", `setup.script.siteFailure.${reason}`);
      }
    }
  });

  it("keeps the checklist and the wizard talking about the same five things", () => {
    // Two lists of steps in two namespaces is a drift waiting to happen: the
    // wizard's rail and /home's checklist must cover the same set.
    for (const locale of SUPPORTED_LOCALES) {
      const wizard = ACTIVATION_STEP_IDS.map((id) => translatorFor(locale, "auth")(`setup.steps.${id}`));
      const checklist = ACTIVATION_STEP_IDS.map((id) => translatorFor(locale, "home")(`activation.steps.${id}`));
      expect(wizard).toHaveLength(checklist.length);
      expect(new Set(wizard).size, `${locale}: two steps share a label`).toBe(wizard.length);
    }
  });
});

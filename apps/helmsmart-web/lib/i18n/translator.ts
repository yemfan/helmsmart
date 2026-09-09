import { createTranslator } from "@leadsmart/i18n";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resources } from "./config";

/**
 * A translator for an EXPLICIT locale — no request, no cookie, no
 * `server-only`.
 *
 * For the code that renders copy a person reads without asking for it: the
 * weekly digest email, an invite, an approval notice. The locale comes from
 * `userUiLocale(recipient)`, and the renderer stays a pure function that a
 * unit test can call.
 *
 *   const t = translatorFor(locale, "emails");
 *   subject: t("digest.subject", { org: org.name })
 */
export const translatorFor = createTranslator({
  resources,
  defaultLocale: DEFAULT_LOCALE,
  supported: SUPPORTED_LOCALES,
});

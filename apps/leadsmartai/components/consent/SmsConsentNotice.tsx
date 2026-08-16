"use client";

import Link from "next/link";
import { getLocale, type LocaleId } from "@/lib/locales/registry";
import { useTranslation } from "react-i18next";

/**
 * Renders the SMS TCPA consent disclosure text in one or more languages.
 *
 * Why bilingual:
 *   FCC rules (47 CFR § 64.1200) require TCPA "prior express written
 *   consent" to be in the recipient's language. When we capture leads
 *   from a mixed bilingual audience (mainland-Chinese-origin US buyers
 *   being the target segment for LeadSmart), we don't know the
 *   recipient's language at form-render time — so we display both EN
 *   and ZH stacked. The single checkbox still serves as the legally-
 *   operative consent action; the text in both languages is the
 *   disclosure record.
 *
 * Source of truth:
 *   The copy for each locale lives in `lib/locales/registry.ts` under
 *   `smsConsentCopy.text`, with a `version` field that bumps any time
 *   the text materially changes. The version string matters for the
 *   audit trail — `user_profiles.sms_consent_version` stores which
 *   version a given user saw, so if the disclosure is later revised,
 *   we can identify who's on an old version and re-consent if counsel
 *   requires.
 *
 * Extending to new languages:
 *   Pass `languages={["en", "zh", "es"]}` once the registry has a
 *   Spanish entry with `smsConsentCopy`. No code change here.
 */
export function SmsConsentNotice({
  languages = ["en", "zh"],
  className,
}: {
  languages?: readonly LocaleId[];
  className?: string;
}) {
  const { t } = useTranslation("dashboard");
  // Keep the "Privacy" / "Terms" links in English only — the legal
  // pages themselves stay English (product decision: legal docs are
  // English-only for accuracy). Translated consent copy points at the
  // same English documents.
  const termsBlock = (
    <>{t("pages.dashFragments.seeOur")}{" "}
      <Link href="/privacy" className="underline" target="_blank">{t("pages.misc.privacyPolicy")}</Link>{" "}
      and{" "}
      <Link href="/terms" className="underline" target="_blank">{t("pages.misc.terms")}</Link>
      .
    </>
  );

  return (
    <div className={className}>
      {languages.map((lang, idx) => {
        const entry = getLocale(lang);
        return (
          <div
            key={lang}
            // Subtle separator between languages when more than one
            // is rendered. Lets the two blocks read as distinct
            // disclosures without shouting about it.
            className={
              idx > 0
                ? "mt-2 border-t border-gray-200 pt-2 text-[11px] leading-relaxed text-gray-700"
                : "text-[11px] leading-relaxed text-gray-700"
            }
            lang={entry.bcp47}
          >
            <span>
              {entry.smsConsentCopy.text}{" "}
              {termsBlock}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The concatenated consent version string that gets stamped into
 * `user_profiles.sms_consent_version` when a user checks the box.
 *
 * Uses the underlying per-locale versions from the registry so that
 * changing any single language's copy automatically surfaces a new
 * composite version. Format: "en-1+zh-1". Order follows the
 * `languages` argument to keep deterministic audit strings.
 */
export function composeConsentVersion(languages: readonly LocaleId[] = ["en", "zh"]): string {
  return languages.map((l) => getLocale(l).smsConsentCopy.version).join("+");
}

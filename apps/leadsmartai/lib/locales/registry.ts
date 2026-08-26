/**
 * Locale registry — single source of truth for every supported language.
 *
 * Adding a new language is a data change in THIS file only:
 *   1. Append an entry to `LOCALE_REGISTRY` with a BCP-47 id (`ja`, `es-MX`, …).
 *   2. Fill in `outboundToneDirective` (shapes how the AI writes to leads).
 *   3. Fill in `smsConsentCopy` (FCC requires consent in recipient's language).
 *   4. Run the template-seed migration with Chinese-equivalent variants
 *      for that locale (see `supabase/migrations/...localization...sql`).
 *
 * Everything downstream — prompt composition, template lookup, UI switcher,
 * translation service — reads from this registry. Business logic never
 * hardcodes locale ids.
 *
 * Scope split:
 *   - `outbound`  — the AI writes to a lead in this language.
 *   - `ui`        — the dashboard renders in this language (gated separately;
 *                   requires 100% message-catalog coverage before enabling,
 *                   per product constraint "user picks EN or ZH, no mix").
 *
 * A locale can be `outbound.enabled` long before `ui.enabled`. Chinese
 * ships outbound-on, UI-off in this PR, and ui flips to on when the
 * message catalog reaches 100% coverage.
 */

export type LocaleId = "en" | "zh";

export type LocaleEntry = {
  /** BCP-47 base id (what app code passes around). */
  id: LocaleId;
  /** BCP-47 tag including region if specified. Used on `<html lang>` etc. */
  bcp47: string;
  /** English-language label for the locale (used in debug/admin UI). */
  label: string;
  /** Native-language label (used in the user-visible language switcher). */
  nativeLabel: string;
  /** Whether the AI may be instructed to reply to leads in this language. */
  outbound: { enabled: boolean };
  /** Whether the dashboard UI can render in this language. */
  ui: { enabled: boolean };
  /**
   * Appended to every outbound AI system prompt when this locale is active.
   * Tells the model HOW to write in this language — register, tone, taboos.
   * Keep under ~600 chars to avoid crowding the main system prompt.
   */
  outboundToneDirective: string;
  /**
   * TCPA / consent disclosure copy that appears next to the SMS opt-in
   * checkbox on lead-capture and signup forms. MUST be reviewed by counsel
   * before shipping to prod; FCC expects written express consent to be in
   * the recipient's language.
   *
   * `version` bumps any time the copy materially changes — ties back to
   * `user_profiles.sms_consent_version` for audit trail.
   */
  smsConsentCopy: { version: string; text: string };
};

/**
 * The canonical fallback. Every read eventually lands here if nothing else
 * resolved. Keep first so `listEnabled()` orders sensibly.
 */
const EN: LocaleEntry = {
  id: "en",
  bcp47: "en-US",
  label: "English",
  nativeLabel: "English",
  outbound: { enabled: true },
  ui: { enabled: true },
  outboundToneDirective:
    "Respond in natural, warm American English. Real-estate-professional register. No idioms that won't translate well if quoted back. Keep tone friendly but never over-familiar.",
  smsConsentCopy: {
    // Bumped from en-1: the platform is CloseBoss now. The version exists so
    // it stays clear which wording a given contact actually agreed to.
    version: "en-2",
    text: "By checking this box, you consent to receive SMS messages from CloseBoss and the agent who invited you, including automated messages. Consent is not a condition of any purchase. Message & data rates may apply. Reply STOP to opt out or HELP for help. See our Privacy Policy and Terms.",
  },
};

/**
 * Simplified Chinese (zh-CN). Target: mainland-origin real-estate clients
 * in the US. Tone directive pushes formal register (您) as default because
 * most first-touch messages are from agent → unknown prospect; the AI
 * should only switch to 你 if the lead has used it first.
 */
const ZH: LocaleEntry = {
  id: "zh",
  bcp47: "zh-CN",
  label: "Chinese (Simplified)",
  nativeLabel: "中文（简体）",
  outbound: { enabled: true },
  ui: {
    // Off until message-catalog coverage is 100%. Turning this on mid-coverage
    // would surface mixed EN/ZH screens, which product has explicitly ruled
    // out ("user picks EN or ZH, no mix"). The language switcher in settings
    // is also gated behind this flag.
    enabled: false,
  },
  outboundToneDirective:
    "Respond in Simplified Chinese (简体中文). Default to the formal register using 您. Only switch to 你 if the lead has used 你 first. Match mainland-Chinese conventions (not Taiwanese). Keep tone warm, respectful, concise — real-estate-professional, not overly salesy. " +
    "Never use investment-guarantee or no-risk language — banned phrases include 稳赚不赔, 包赚, 保本, 零风险 / 无风险 / 绝无风险, 高回报保证, 包租. " +
    "Never use hard-sell / FOMO phrasing: 一步到位, 机不可失, 错过不再有, 最后机会, 限时优惠 / 仅今天 — unless tied to a real deadline the agent has confirmed. " +
    "Both categories violate brand tone and Tencent content policy (matters when we add WeChat). " +
    "Write numbers as Arabic digits (500,000) not Chinese numerals (五十万) unless mirroring the lead. For dollar amounts, use USD (e.g., 500,000 美元) to avoid RMB confusion.",
  smsConsentCopy: {
    version: "zh-2",
    text: "勾选此框即表示您同意 CloseBoss 及邀请您的房产经纪人通过短信（包括自动发送的短信）与您联系。同意并非购买任何服务的前提条件。可能会产生短信和数据费用。回复 STOP（或 ALTO）取消订阅，回复 HELP 获得帮助。请查阅我们的《隐私政策》和《服务条款》（以英文为准）。",
  },
};

export const LOCALE_REGISTRY: Record<LocaleId, LocaleEntry> = {
  en: EN,
  zh: ZH,
};

/** The canonical default when nothing else resolves. */
export const DEFAULT_LOCALE: LocaleId = "en";

/** Type guard — `true` iff `id` is a known registry key. */
export function isSupportedLocale(id: unknown): id is LocaleId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, id);
}

/** Narrow + fall back. Accepts anything; returns a valid LocaleId. */
export function coerceLocale(id: unknown): LocaleId {
  return isSupportedLocale(id) ? id : DEFAULT_LOCALE;
}

export function getLocale(id: LocaleId): LocaleEntry {
  return LOCALE_REGISTRY[id];
}

/** All locales with outbound enabled. Used to validate lead / agent prefs. */
export function listOutboundEnabled(): LocaleEntry[] {
  return Object.values(LOCALE_REGISTRY).filter((l) => l.outbound.enabled);
}

/** All locales with UI enabled. Used by the language-switcher component. */
export function listUiEnabled(): LocaleEntry[] {
  return Object.values(LOCALE_REGISTRY).filter((l) => l.ui.enabled);
}

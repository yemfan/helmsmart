/**
 * BCP-47 tag for `Intl` / `toLocaleDateString` / `toLocaleTimeString`.
 *
 * The map lives in the shared package (`zh-Hans` → `zh-CN`, `es` → `es-US`,
 * anything else → `en-US`). Pass `i18n.language` from `useTranslation()` so
 * the value re-renders when the agent flips the toggle.
 */
export { intlLocale } from "@leadsmart/i18n";

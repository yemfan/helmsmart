/**
 * Key resolution now lives in the shared package so HelmSmart runs the same
 * order (locale → defaultValue → English → key) and the same plural rule.
 * This module stays as the app's import path.
 */
export {
  interpolate,
  lookupString,
  pluralCandidates,
  resolveKey,
  type Bundle,
  type ResolveInput,
} from "@leadsmart/i18n";

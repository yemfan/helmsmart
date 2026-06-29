import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Merges with `app.json`. Use `EXPO_PUBLIC_LEADSMART_API_URL` for the LeadSmart AI web API
 * (e.g. `https://your-leadsmart.vercel.app` — no trailing slash).
 *
 * EAS cannot auto-inject `extra.eas.projectId` into TypeScript config — set
 * `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env.local` or keep the default below after `eas init` / dashboard link.
 */
function envFirst(...keys: (string | undefined)[]): string {
  for (const k of keys) {
    const v = k?.trim();
    if (v) return v;
  }
  return "";
}

/** Linked EAS project (dashboard). Override with EXPO_PUBLIC_EAS_PROJECT_ID for a different project. */
const DEFAULT_EAS_PROJECT_ID = "146f9ab1-a17d-4b90-a005-e6fa6749c6ed";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  /** Shown under the icon on iOS/Android — keep literal so EAS merges never drop it. */
  name: "RealtyBoss",
  slug: config.slug ?? "leadsmart-mobile",
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleDisplayName: "RealtyBoss",
    },
  },
  extra: {
    ...config.extra,
    leadsmartApiUrl: envFirst(process.env.EXPO_PUBLIC_LEADSMART_API_URL),
    /** Dev: Supabase JWT for `Authorization: Bearer` (same session as LeadSmart AI web). */
    leadsmartAccessToken: envFirst(process.env.EXPO_PUBLIC_LEADSMART_ACCESS_TOKEN),
    supabaseUrl: envFirst(process.env.EXPO_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: envFirst(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    /** EAS project ID for `getExpoPushTokenAsync` (production / dev builds). */
    eas: {
      projectId: envFirst(process.env.EXPO_PUBLIC_EAS_PROJECT_ID, DEFAULT_EAS_PROJECT_ID),
    },
  },
});

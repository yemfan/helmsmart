/**
 * Mobile i18next initialization.
 *
 * Resolution order on app startup:
 *   1. User-chosen locale from AsyncStorage (set by the Language
 *      picker in Settings)
 *   2. Device locale from expo-localization (`zh-CN` → `zh-Hans`,
 *      `en-US` → `en`, etc.)
 *   3. DEFAULT_LOCALE (English)
 *
 * Translation resources are bundled — we import the JSONs directly
 * from `@leadsmart/i18n` instead of loading them over the network.
 * For an offline-first app this is the right tradeoff; the bundle
 * size cost of every supported locale is small (kilobytes per
 * namespace) compared to startup latency.
 *
 * Call `initI18n()` once from the root layout; `useTranslation()`
 * from `react-i18next` works everywhere after that.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LOCALE,
  resolveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@leadsmart/i18n";

import enCalendarScreen from "@leadsmart/i18n/locale/en/calendar_screen";
import enCommon from "@leadsmart/i18n/locale/en/common";
import enHome from "@leadsmart/i18n/locale/en/home";
import enInbox from "@leadsmart/i18n/locale/en/inbox";
import enLeadComponents from "@leadsmart/i18n/locale/en/lead_components";
import enLeadDetail from "@leadsmart/i18n/locale/en/lead_detail";
import enLeads from "@leadsmart/i18n/locale/en/leads";
import enMobileMiscScreens from "@leadsmart/i18n/locale/en/mobile_misc_screens";
import enNav from "@leadsmart/i18n/locale/en/nav";
import enOnboarding from "@leadsmart/i18n/locale/en/onboarding";
import enPostcards from "@leadsmart/i18n/locale/en/postcards";
import enQuickPost from "@leadsmart/i18n/locale/en/quick_post";
import enReplyComposer from "@leadsmart/i18n/locale/en/reply_composer";
import enSettings from "@leadsmart/i18n/locale/en/settings";
import enShowingsScreen from "@leadsmart/i18n/locale/en/showings_screen";
import enSphereScreen from "@leadsmart/i18n/locale/en/sphere_screen";
import enTaskCalendarComponents from "@leadsmart/i18n/locale/en/task_calendar_components";
import zhCalendarScreen from "@leadsmart/i18n/locale/zh-Hans/calendar_screen";
import zhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
import zhHome from "@leadsmart/i18n/locale/zh-Hans/home";
import zhInbox from "@leadsmart/i18n/locale/zh-Hans/inbox";
import zhLeadComponents from "@leadsmart/i18n/locale/zh-Hans/lead_components";
import zhLeadDetail from "@leadsmart/i18n/locale/zh-Hans/lead_detail";
import zhLeads from "@leadsmart/i18n/locale/zh-Hans/leads";
import zhMobileMiscScreens from "@leadsmart/i18n/locale/zh-Hans/mobile_misc_screens";
import zhNav from "@leadsmart/i18n/locale/zh-Hans/nav";
import zhOnboarding from "@leadsmart/i18n/locale/zh-Hans/onboarding";
import zhPostcards from "@leadsmart/i18n/locale/zh-Hans/postcards";
import zhQuickPost from "@leadsmart/i18n/locale/zh-Hans/quick_post";
import zhReplyComposer from "@leadsmart/i18n/locale/zh-Hans/reply_composer";
import zhSettings from "@leadsmart/i18n/locale/zh-Hans/settings";
import zhShowingsScreen from "@leadsmart/i18n/locale/zh-Hans/showings_screen";
import zhSphereScreen from "@leadsmart/i18n/locale/zh-Hans/sphere_screen";
import zhTaskCalendarComponents from "@leadsmart/i18n/locale/zh-Hans/task_calendar_components";

const STORAGE_KEY = "i18n:locale";

const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    nav: enNav,
    home: enHome,
    quick_post: enQuickPost,
    leads: enLeads,
    lead_detail: enLeadDetail,
    lead_components: enLeadComponents,
    task_calendar_components: enTaskCalendarComponents,
    reply_composer: enReplyComposer,
    inbox: enInbox,
    calendar_screen: enCalendarScreen,
    showings_screen: enShowingsScreen,
    sphere_screen: enSphereScreen,
    mobile_misc_screens: enMobileMiscScreens,
    onboarding: enOnboarding,
    postcards: enPostcards,
  },
  "zh-Hans": {
    common: zhCommon,
    settings: zhSettings,
    nav: zhNav,
    home: zhHome,
    quick_post: zhQuickPost,
    leads: zhLeads,
    lead_detail: zhLeadDetail,
    lead_components: zhLeadComponents,
    task_calendar_components: zhTaskCalendarComponents,
    reply_composer: zhReplyComposer,
    inbox: zhInbox,
    calendar_screen: zhCalendarScreen,
    showings_screen: zhShowingsScreen,
    sphere_screen: zhSphereScreen,
    mobile_misc_screens: zhMobileMiscScreens,
    onboarding: zhOnboarding,
    postcards: zhPostcards,
  },
} as const;

/**
 * Read the persisted locale choice. Returns null when the user
 * hasn't picked one yet (first launch path).
 */
export async function getStoredLocale(): Promise<SupportedLocale | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return resolveLocale(raw);
  } catch {
    return null;
  }
}

/**
 * Persist the user's language choice and switch i18next in-place
 * so all mounted components re-render in the new locale.
 */
export async function setStoredLocale(locale: SupportedLocale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
  await i18n.changeLanguage(locale);
}

/**
 * Best-effort device locale → SupportedLocale. expo-localization
 * returns an array of locales the user prefers (in order); we walk
 * it and pick the first one we recognize.
 */
function detectDeviceLocale(): SupportedLocale | null {
  try {
    const locales = Localization.getLocales();
    for (const loc of locales) {
      const tag = loc.languageTag ?? loc.languageCode;
      const resolved = resolveLocale(tag);
      if (resolved) return resolved;
    }
  } catch {
    // expo-localization can throw on rare devices; fall through.
  }
  return null;
}

let initPromise: Promise<typeof i18n> | null = null;

/**
 * Initialize i18next once per app session. Safe to call multiple
 * times — subsequent calls return the same promise.
 */
export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const stored = await getStoredLocale();
    const fallback = detectDeviceLocale();
    const initial: SupportedLocale = stored ?? fallback ?? DEFAULT_LOCALE;

    await i18n.use(initReactI18next).init({
      resources,
      lng: initial,
      fallbackLng: DEFAULT_LOCALE,
      // Whitelist supported locales so an unknown stored value
      // doesn't bypass the resolver.
      supportedLngs: [...SUPPORTED_LOCALES],
      defaultNS: "common",
      ns: [
        "common",
        "settings",
        "nav",
        "home",
        "quick_post",
        "leads",
        "lead_detail",
        "lead_components",
        "task_calendar_components",
        "reply_composer",
        "inbox",
        "calendar_screen",
        "showings_screen",
        "sphere_screen",
        "mobile_misc_screens",
      ],
      interpolation: {
        // React Native handles escaping; double-escaping breaks
        // strings with apostrophes / quotes inside translations.
        escapeValue: false,
      },
      react: {
        // Suspense isn't worth the wiring on mobile — resources are
        // bundled, so the synchronous init above means `t()` returns
        // strings immediately on first render.
        useSuspense: false,
      },
    });
    return i18n;
  })();
  return initPromise;
}

export { i18n };

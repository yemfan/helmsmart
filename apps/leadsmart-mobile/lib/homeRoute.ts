/**
 * The one screen every signed-in entry lands on — cold start, login,
 * end of onboarding. Keep every `router.replace` to the home tab pointed
 * here so the app cannot grow a second front door again.
 */
export const HOME_ROUTE = "/(tabs)/boss" as const;

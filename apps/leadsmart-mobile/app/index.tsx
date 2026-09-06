import { Redirect } from "expo-router";
import { ScreenLoading } from "../components/ScreenLoading";
import { useLeadsmartSession } from "../lib/session/LeadsmartSessionContext";
import { HOME_ROUTE } from "../lib/homeRoute";

/**
 * Auth + onboarding gate: first-time users walk through `(onboarding)`;
 * signed-in users land on `HOME_ROUTE` (the Boss tab).
 *
 * This used to point at `/(tabs)/home`, a legacy screen the tab bar hides —
 * so every cold start opened on a screen with no tab highlighted, while
 * login sent people to Inbox. One home for every entry now.
 */
export default function Index() {
  const { ready, accessToken, onboardingComplete } = useLeadsmartSession();

  if (!ready) {
    return <ScreenLoading message="Starting…" />;
  }

  if (!onboardingComplete) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (!accessToken?.trim()) {
    return <Redirect href="/(onboarding)/login" />;
  }

  return <Redirect href={HOME_ROUTE} />;
}

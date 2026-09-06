import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { i18n, initI18n } from "../lib/i18n";
import { NetworkProvider } from "../lib/offline/NetworkContext";
import { LeadsmartSessionProvider } from "../lib/session/LeadsmartSessionContext";
import { useLeadsmartPush } from "../lib/useLeadsmartPush";

function RootNavigation() {
  useLeadsmartPush();
  // Header titles were English literals while every tab label was translated.
  const { t } = useTranslation("nav");

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: "#0f172a",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="expenses" options={{ title: t("stack.expenses") }} />
      <Stack.Screen name="notifications" options={{ title: t("stack.notifications") }} />
      <Stack.Screen name="delete-account" options={{ title: t("stack.deleteAccount") }} />
      <Stack.Screen name="lead/[id]" options={{ title: t("stack.lead") }} />
      <Stack.Screen name="assistant/[type]" options={{ title: t("stack.assistant") }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Block the first paint until i18next has resolved the stored
  // locale → otherwise the screen flashes English for a few frames
  // before snapping to the user's language on first render.
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void initI18n().then(() => {
      if (!cancelled) setI18nReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Geist Sans (4 weights) + Geist Mono (one medium for tabular
  // numerics). Weights map to the scale exported from
  // `lib/typography.ts` — keep both in sync. While `fontsLoaded` is
  // false, RN draws with the system sans (SF on iOS, Roboto on
  // Android), which is close enough to Geist metrics that the swap
  // doesn't reflow.
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
  });

  if (!i18nReady || !fontsLoaded) return null;

  return (
    // `GestureHandlerRootView` is required by @gorhom/bottom-sheet to
    // process pan gestures; `BottomSheetModalProvider` registers the
    // imperative `BottomSheetModal` portal so any descendant can call
    // `bottomSheetRef.current?.present()` regardless of where it sits
    // in the tree. Both must wrap the entire app — installing them
    // here in `_layout.tsx` is the canonical pattern.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <NetworkProvider>
          <LeadsmartSessionProvider>
            <BottomSheetModalProvider>
              <RootNavigation />
            </BottomSheetModalProvider>
          </LeadsmartSessionProvider>
        </NetworkProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

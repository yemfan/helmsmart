import { Tabs } from "expo-router";
import { Platform, StatusBar, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useThemeTokens, useIsDarkMode } from "../../lib/useThemeTokens";
import { hapticTabSwitch } from "../../lib/haptics";
import { OfflineBanner } from "../../components/OfflineBanner";
import { type } from "../../lib/typography";

/**
 * Bottom tab bar — batch-3 dark mode wiring.
 *
 * Previously this module held hardcoded brand/gray constants and
 * `#fff` backgrounds, so even when the rest of the app learned
 * to respect `useColorScheme()`, switching the phone to dark mode
 * left the tab bar and navigation header stuck in permanent light
 * mode. Now every color comes from `useThemeTokens()` so the
 * entire chrome follows the OS setting live.
 */
export default function TabsLayout() {
  const tokens = useThemeTokens();
  const isDark = useIsDarkMode();
  const { t } = useTranslation("nav");

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <OfflineBanner />
      <Tabs
        screenListeners={{
          // Light "selection changed" tick on every tab press.
          // Fires via React Navigation's tabPress event so both
          // the active and inactive presses get feedback (the
          // active tap feels like a "pop-to-top" acknowledgment).
          tabPress: () => {
            hapticTabSwitch();
          },
        }}
        screenOptions={{
          headerTitle: "RealtyBoss",
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: tokens.surface,
            ...(Platform.OS === "ios"
              ? {
                  // Light hairline using `brandScale[100]` (very pale
                  // blue) instead of the neutral slate border — gives
                  // the chrome a subtle brand presence without being
                  // loud.
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark
                    ? tokens.border
                    : tokens.brandScale[100],
                }
              : {}),
          },
          headerTitleStyle: {
            ...type.titleMd,
            color: tokens.text,
          },
          // Active tint pulls from the `brand` ramp at `[600]` so the
          // selected tab reads as the brand color at full saturation;
          // inactive uses `[400]` on the neutral ramp for a softer
          // contrast than pure slate.
          tabBarActiveTintColor: isDark
            ? tokens.brandScale[600]
            : tokens.brandScale[600],
          tabBarInactiveTintColor: tokens.neutralScale[400],
          tabBarStyle: {
            backgroundColor: tokens.surface,
            borderTopColor: isDark ? tokens.border : tokens.brandScale[100],
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingTop: 4,
            ...(Platform.OS === "ios" ? { height: 88 } : {}),
          },
          tabBarLabelStyle: type.tabLabel,
        }}
      >
        {/* v1.6 supercategory tab bar — mirrors the web PremiumSidebarV2
         * sections (Home / Work / Engage / Analyze / Manage). The legacy
         * inbox / leads / calendar / settings tabs are kept as routes
         * (so deep links like router.push("/(tabs)/inbox") still resolve
         * from push notifications + the Home alert cards) but hidden
         * from the tab bar via href: null. Users reach those screens
         * by tapping the corresponding tile inside a supercategory tab.
         * See apps/leadsmart-mobile/docs/HOME_REDESIGN_PLAN.md. */}
        <Tabs.Screen
          name="boss"
          options={{
            title: "Bossy",
            tabBarLabel: "Bossy",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="sparkles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: t("tabs.home"),
            tabBarLabel: t("tabs.home"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="work"
          options={{
            title: t("tabs.work"),
            tabBarLabel: t("tabs.work"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="briefcase-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="engage"
          options={{
            title: t("tabs.engage"),
            tabBarLabel: t("tabs.engage"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="megaphone-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="analyze"
          options={{
            title: t("tabs.analyze"),
            tabBarLabel: t("tabs.analyze"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="manage"
          options={{
            title: t("tabs.manage"),
            tabBarLabel: t("tabs.manage"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />

        {/* Hidden-from-tab-bar routes — still navigable via router.push */}
        <Tabs.Screen
          name="inbox"
          options={{ title: t("tabs.inbox"), href: null }}
        />
        <Tabs.Screen
          name="leads"
          options={{ title: t("tabs.leads"), href: null }}
        />
        <Tabs.Screen
          name="calendar"
          options={{ title: t("tabs.calendar"), href: null }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: t("tabs.settings"), href: null }}
        />
        <Tabs.Screen
          name="offer-desk"
          options={{ title: "Offer desk", href: null }}
        />
      </Tabs>
    </>
  );
}

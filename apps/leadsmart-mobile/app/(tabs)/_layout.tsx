import { Tabs } from "expo-router";
import { Platform, StatusBar, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useThemeTokens, useIsDarkMode } from "../../lib/useThemeTokens";
import { hapticTabSwitch } from "../../lib/haptics";
import { OfflineBanner } from "../../components/OfflineBanner";
import { FloatingTabBar, type FloatingTabBarProps } from "../../components/FloatingTabBar";
import { ProfileButton } from "../../components/ProfileButton";
import { type } from "../../lib/typography";

/**
 * Tab bar — Ask Max · Tasks · Deals · Calendar · More, mirroring the web
 * sidebar's first level, drawn as a floating pill with the active tab in
 * its own well (components/FloatingTabBar). Leads, Inbox and the Team
 * roster are one tap away as cards under More; they keep their routes here
 * (hidden below) so deep links and existing pushes still resolve.
 *
 * Every colour comes from `useThemeTokens()` so the chrome follows the OS
 * dark-mode setting live.
 */
const VISIBLE_TABS = ["boss", "tasks", "deals", "calendar", "more"] as const;

export default function TabsLayout() {
  const tokens = useThemeTokens();
  const isDark = useIsDarkMode();
  const { t } = useTranslation("nav");

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <OfflineBanner />
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar {...(props as unknown as Omit<FloatingTabBarProps, "visible">)} visible={VISIBLE_TABS} />
        )}
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
          headerTitle: "CloseBoss",
          headerShadowVisible: false,
          // The agent's photo, top right on every tab — the same place the
          // web dashboard keeps the account menu. Tapping it opens Settings.
          headerRight: () => <ProfileButton />,
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
        }}
      >
        <Tabs.Screen
          name="boss"
          options={{
            title: t("tabs.boss"),
            tabBarLabel: t("tabs.boss"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="sparkles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: t("tabs.tasks"),
            tabBarLabel: t("tabs.tasks"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="checkmark-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            title: t("tabs.deals"),
            tabBarLabel: t("tabs.deals"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t("tabs.calendar"),
            tabBarLabel: t("tabs.calendar"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t("tabs.more"),
            tabBarLabel: t("tabs.more"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
            ),
          }}
        />

        {/* Off the bar, still routable — deep links from push notifications
         * and every existing router.push keep working. */}
        <Tabs.Screen name="inbox" options={{ title: t("tabs.inbox"), href: null }} />
        <Tabs.Screen name="leads" options={{ title: t("tabs.leads"), href: null }} />
        <Tabs.Screen name="team" options={{ title: t("tabs.team"), href: null }} />
        <Tabs.Screen name="settings" options={{ title: t("tabs.settings"), href: null }} />
        <Tabs.Screen name="offer-desk" options={{ title: "Offer desk", href: null }} />
      </Tabs>
    </>
  );
}

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
          headerTitle: "CloseBoss",
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
        {/* Daily tab bar — Boss (home) · Inbox · Leads · Calendar · More.
         * Ordered by how often an agent opens each one in a day. The Team
         * roster moved off the bar (it is a static list of five rows):
         * Boss already shows the team live, and it is one tap away under
         * More. Calendar took the slot because it is daily work. The legacy
         * supercategory screens (home / work / engage / analyze / manage)
         * are gone — cold start used to land on the hidden `home`, which
         * highlighted no tab at all. */}
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
          name="inbox"
          options={{
            title: t("tabs.inbox"),
            tabBarLabel: t("tabs.inbox"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="leads"
          options={{
            title: t("tabs.leads"),
            tabBarLabel: t("tabs.leads"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
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

        {/* Hidden-from-tab-bar routes — still navigable via router.push
         * (deep links from push notifications + tiles still resolve). */}
        <Tabs.Screen
          name="team"
          options={{ title: t("tabs.team"), href: null }}
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

import * as Notifications from "expo-notifications";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";
import { useCloseBossSession } from "../../lib/session/CloseBossSessionContext";
import { BackRow } from "../../components/onboarding/BackRow";
import { HOME_ROUTE } from "../../lib/homeRoute";

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { t } = useTranslation("onboarding");
  const { markOnboardingComplete } = useCloseBossSession();
  const [busy, setBusy] = useState(false);

  const finishToInbox = async () => {
    setBusy(true);
    try {
      await markOnboardingComplete();
    } finally {
      setBusy(false);
      router.replace(HOME_ROUTE);
    }
  };

  const onEnable = async () => {
    setBusy(true);
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let next = existing;
      if (existing !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        next = req.status;
      }
      if (next === "granted" && Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "CloseBoss",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
    } finally {
      setBusy(false);
      await finishToInbox();
    }
  };

  return (
    <SafeAreaView style={s.flex} edges={["top", "bottom"]}>
      <BackRow fallbackHref="/(onboarding)/login" />
      <View style={s.safePad}>
        <View style={s.centerBlock}>
          <Text style={s.kicker}>{t("notifications.kicker")}</Text>
          <Text style={s.title}>{t("notifications.title")}</Text>
          <Text style={s.body}>{t("notifications.body")}</Text>
        </View>
        <View>
          <Pressable
            style={[s.primaryBtn, busy && { opacity: 0.7 }]}
            onPress={() => void onEnable()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.enable")}
          >
            <Text style={s.primaryBtnText}>{t("notifications.enable")}</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => void finishToInbox()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.skip_a11y")}
          >
            <Text style={s.secondaryBtnText}>{t("notifications.skip")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

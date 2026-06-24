import * as Notifications from "expo-notifications";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";
import { useLeadsmartSession } from "../../lib/session/LeadsmartSessionContext";
import { BackRow } from "../../components/onboarding/BackRow";

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { markOnboardingComplete } = useLeadsmartSession();
  const [busy, setBusy] = useState(false);

  const finishToInbox = async () => {
    setBusy(true);
    try {
      await markOnboardingComplete();
    } finally {
      setBusy(false);
      router.replace("/(tabs)/inbox");
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
          name: "RealtorBoss",
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
          <Text style={s.kicker}>Stay in the loop</Text>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.body}>
            Get alerted for hot leads and new inbound messages. You can change this anytime in system
            settings.
          </Text>
        </View>
        <View>
          <Pressable
            style={[s.primaryBtn, busy && { opacity: 0.7 }]}
            onPress={() => void onEnable()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Enable notifications"
          >
            <Text style={s.primaryBtnText}>Enable notifications</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => void finishToInbox()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Skip notifications"
          >
            <Text style={s.secondaryBtnText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

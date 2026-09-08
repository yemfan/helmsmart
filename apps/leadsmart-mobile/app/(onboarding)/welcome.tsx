import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { t } = useTranslation("onboarding");

  return (
    <SafeAreaView style={s.flex} edges={["top", "bottom"]}>
      <View style={s.safePad}>
        <View style={s.centerBlock}>
          <Text style={s.kicker}>{t("welcome.kicker")}</Text>
          <Text style={s.title}>{t("welcome.title")}</Text>
          <Text style={s.body}>{t("welcome.body")}</Text>
        </View>
        <View>
          <Pressable
            style={s.primaryBtn}
            onPress={() => router.push("/(onboarding)/value")}
            accessibilityRole="button"
            accessibilityLabel={t("welcome.get_started_a11y")}
          >
            <Text style={s.primaryBtnText}>{t("welcome.get_started")}</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => router.push("/(onboarding)/login")}
            accessibilityRole="button"
            accessibilityLabel={t("welcome.sign_in_a11y")}
          >
            <Text style={s.secondaryBtnText}>{t("welcome.sign_in_link")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

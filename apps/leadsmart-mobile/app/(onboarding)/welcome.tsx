import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();

  return (
    <SafeAreaView style={s.flex} edges={["top", "bottom"]}>
      <View style={s.safePad}>
        <View style={s.centerBlock}>
          <Text style={s.kicker}>RealtorBoss</Text>
          <Text style={s.title}>Your pipeline, in your pocket</Text>
          <Text style={s.body}>
            See hot leads, reply faster, and stay on top of SMS and email — built for agents on the go.
          </Text>
        </View>
        <View>
          <Pressable
            style={s.primaryBtn}
            onPress={() => router.push("/(onboarding)/value")}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={s.primaryBtnText}>Get started</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => router.push("/(onboarding)/login")}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={s.secondaryBtnText}>Already have an account? Sign in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";
import { BackRow } from "../../components/onboarding/BackRow";

const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES = [
  {
    title: "Never miss a hot lead",
    body: "Inbox prioritizes urgent threads so you can respond when it matters — before the deal goes cold.",
  },
  {
    title: "Full context, fast",
    body: "Open any lead to see recent SMS and email, AI signals, and quick actions to call or message.",
  },
];

export default function OnboardingValueScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / SCREEN_W);
    setPage(Math.max(0, Math.min(SLIDES.length - 1, i)));
  }, []);

  const goNext = useCallback(() => {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: SCREEN_W * (page + 1), animated: true });
      return;
    }
    router.push("/(onboarding)/login");
  }, [page, router]);

  return (
    <SafeAreaView style={s.flex} edges={["top", "bottom"]}>
      <BackRow fallbackHref="/(onboarding)/welcome" />
      <View style={{ flex: 1, paddingTop: 8 }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          keyboardShouldPersistTaps="handled"
        >
          {SLIDES.map((slide, idx) => (
            <View key={idx} style={{ width: SCREEN_W, paddingHorizontal: 24 }}>
              <Text style={s.kicker}>Why RealtyBoss</Text>
              <Text style={s.title}>{slide.title}</Text>
              <Text style={s.body}>{slide.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[s.pagerDotRow, { paddingBottom: 8 }]}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[s.dot, i === page && s.dotActive]} />
          ))}
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
          <Pressable
            style={s.primaryBtn}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={page < SLIDES.length - 1 ? "Next slide" : "Continue to sign in"}
          >
            <Text style={s.primaryBtnText}>{page < SLIDES.length - 1 ? "Next" : "Continue"}</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => router.push("/(onboarding)/login")}
            accessibilityRole="button"
            accessibilityLabel="Skip to sign in"
          >
            <Text style={s.secondaryBtnText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

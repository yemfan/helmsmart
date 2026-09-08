import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

/** i18n keys under `onboarding.value.*`. */
const SLIDES = [
  { title: "value.slide1_title", body: "value.slide1_body" },
  { title: "value.slide2_title", body: "value.slide2_body" },
];

export default function OnboardingValueScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { t } = useTranslation("onboarding");
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
              <Text style={s.kicker}>{t("value.kicker")}</Text>
              <Text style={s.title}>{t(slide.title)}</Text>
              <Text style={s.body}>{t(slide.body)}</Text>
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
            accessibilityLabel={page < SLIDES.length - 1 ? t("value.next_a11y") : t("value.continue_a11y")}
          >
            <Text style={s.primaryBtnText}>{page < SLIDES.length - 1 ? t("value.next") : t("value.continue")}</Text>
          </Pressable>
          <Pressable
            style={s.secondaryBtn}
            onPress={() => router.push("/(onboarding)/login")}
            accessibilityRole="button"
            accessibilityLabel={t("value.skip_a11y")}
          >
            <Text style={s.secondaryBtnText}>{t("value.skip")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

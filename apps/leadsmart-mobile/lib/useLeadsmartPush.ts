import * as Device from "expo-device";
import { HOME_ROUTE } from "./homeRoute";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getLeadsmartAccessToken } from "./env";
import { registerMobileExpoPushToken } from "./leadsmartMobileApi";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const KINDS = new Set<string>([
  "hot_lead",
  "inbound_sms",
  "inbound_email",
  "needs_human",
  "reminder",
  "missed_call",
  "reminder_digest",
  "publish_failure",
  "briefing_morning",
  "briefing_evening",
]);

function navigateFromPushData(
  router: ReturnType<typeof useRouter>,
  raw: Record<string, unknown>
) {
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  const screen = typeof raw.screen === "string" ? raw.screen : "";
  const leadId = typeof raw.leadId === "string" ? raw.leadId : undefined;
  const taskId = typeof raw.taskId === "string" ? raw.taskId : undefined;

  if (screen === "notifications" || kind === "reminder_digest") {
    router.push("/notifications");
    return;
  }

  // Publish-failure pushes — route to /scheduled where the agent
  // can see last_error context + decide whether to retry.
  if (screen === "scheduled" || kind === "publish_failure") {
    router.push("/scheduled" as never);
    return;
  }

  // Engagement-milestone pushes — route to /post-history where the
  // row renders with the just-refreshed metrics. The triggering
  // post is usually top-of-list (newest published) so no per-row
  // anchor is needed.
  if (screen === "post_history") {
    router.push("/post-history" as never);
    return;
  }

  // Briefing pushes (morning/evening) — route to the briefings history
  // page, which shows the freshly-arrived briefing. (The Home screen no
  // longer carries an inline briefings card; the same section lives in the
  // Boss assistant + /briefings.)
  if (kind === "briefing_morning" || kind === "briefing_evening") {
    router.push("/briefings" as never);
    return;
  }

  if (screen === "home") {
    router.push(HOME_ROUTE);
    return;
  }

  if (screen === "task" && taskId) {
    router.push({ pathname: "/(tabs)/tasks", params: { focusTaskId: taskId } });
    return;
  }

  if (screen === "call_log" && leadId) {
    router.push({ pathname: "/lead/[id]", params: { id: leadId } });
    return;
  }

  if (leadId && (screen === "lead" || screen === "" || !screen)) {
    router.push({ pathname: "/lead/[id]", params: { id: leadId } });
    return;
  }

  if (kind && KINDS.has(kind) && leadId) {
    router.push({ pathname: "/lead/[id]", params: { id: leadId } });
  }
}

/**
 * Registers the Expo push token with the LeadSmart AI API when JWT + API URL are set,
 * and routes when the user taps a notification.
 */
export function useLeadsmartPush() {
  const router = useRouter();
  const lastRegisteredToken = useRef<string | null>(null);
  const accessToken = getLeadsmartAccessToken();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification?.request.content.data;
      if (data && typeof data === "object") {
        navigateFromPushData(router, data as Record<string, unknown>);
      }
    });
    return () => sub.remove();
  }, [router]);

  const openedFromNotification = useRef(false);
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (openedFromNotification.current) return;
      if (!response?.notification) return;
      openedFromNotification.current = true;
      const data = response.notification.request.content.data;
      if (data && typeof data === "object") {
        navigateFromPushData(router, data as Record<string, unknown>);
      }
    });
  }, [router]);

  useEffect(() => {
    if (!accessToken) {
      lastRegisteredToken.current = null;
      return;
    }
    if (!Device.isDevice) return;

    let cancelled = false;

    void (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "CloseBoss",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      const projectId =
        (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId: String(projectId) } : undefined
      );
      if (cancelled || !tokenResult.data) return;

      if (lastRegisteredToken.current === tokenResult.data) return;
      lastRegisteredToken.current = tokenResult.data;

      const reg = await registerMobileExpoPushToken(tokenResult.data);
      if (reg.ok === false) {
        lastRegisteredToken.current = null;
        console.warn("[LeadSmart AI] push token registration failed:", reg.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);
}

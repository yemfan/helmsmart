import { useEffect, useRef } from "react";
import { getCloseBossAccessToken } from "../env";
import { createMobileSupabaseClient } from "../supabaseMobile";
import { debounceFn } from "./debounce";

const DEBOUNCE_MS = 450;

/**
 * Subscribes to INSERT on `sms_messages` / `email_messages` for the signed-in agent (RLS-scoped).
 * Triggers a debounced silent refresh — no full-screen loading.
 */
export function useInboxRealtime(onRefresh: () => void, enabled: boolean) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const token = getCloseBossAccessToken();

  useEffect(() => {
    if (!enabled || !token) return;

    const client = createMobileSupabaseClient(token);
    if (!client) return;

    const { run, cancel } = debounceFn(() => {
      onRefreshRef.current();
    }, DEBOUNCE_MS);

    const channelName = `mobile-inbox-${token.slice(-12)}`;
    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages" },
        () => {
          run();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_messages" },
        () => {
          run();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[CloseBoss] inbox realtime channel error");
        }
      });

    return () => {
      cancel();
      void client.removeChannel(channel);
    };
  }, [enabled, token]);
}

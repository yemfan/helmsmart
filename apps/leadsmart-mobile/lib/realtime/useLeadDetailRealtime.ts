import { useEffect, useRef } from "react";
import { getCloseBossAccessToken } from "../env";
import { createMobileSupabaseClient } from "../supabaseMobile";
import { debounceFn } from "./debounce";

const DEBOUNCE_MS = 350;

/**
 * Subscribes to new/updated rows for one lead:
 * - `sms_messages` / `email_messages` INSERT → conversation list changes
 * - `sms_conversations` INSERT/UPDATE → AI thread JSON updated (refetch to stay aligned with CRM)
 *
 * Debounced callback avoids hammering the API on burst writes.
 */
export function useLeadDetailRealtime(
  leadId: string | undefined,
  onRefresh: () => void,
  enabled: boolean
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const token = getCloseBossAccessToken();

  useEffect(() => {
    if (!enabled || !token || !leadId?.trim()) return;

    const client = createMobileSupabaseClient(token);
    if (!client) return;

    const filter = `lead_id=eq.${leadId.trim()}`;

    const { run, cancel } = debounceFn(() => {
      onRefreshRef.current();
    }, DEBOUNCE_MS);

    const channelName = `mobile-lead-${leadId.trim()}`;
    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages", filter },
        () => {
          run();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_messages", filter },
        () => {
          run();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_conversations", filter },
        () => {
          run();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sms_conversations", filter },
        () => {
          run();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[CloseBoss] lead detail realtime channel error");
        }
      });

    return () => {
      cancel();
      void client.removeChannel(channel);
    };
  }, [enabled, token, leadId]);
}

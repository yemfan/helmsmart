"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function saveReminderSettings(input: {
  autoSend: boolean;
  daysIntervals: number[];
  maxCount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("books");
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: t("invoices.errors.notAuthenticated") };

  const db = await createServiceClient();
  const { error } = await db
    .from("organizations")
    .update({
      auto_send_reminders: input.autoSend,
      reminder_days_intervals: input.daysIntervals,
      reminder_max_count: input.maxCount,
    })
    .eq("id", orgId);

  if (error) {
    console.error("[reminder-settings] update error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

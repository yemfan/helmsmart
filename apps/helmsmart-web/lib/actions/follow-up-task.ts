"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { normalizePhoneE164 } from "@/lib/phone";
import { getMemberOrgId } from "@/lib/auth/org-context";

/**
 * Create a follow-up task for a pipeline client, with a suggested text to send.
 *
 * Nothing is generated and nothing is sent: the message is a fixed template,
 * and the owner sends it themselves. This used to be "Ask Sarah to follow up":
 * it ran through Sarah's autonomy gate, opened a run in her name, notified
 * "Sarah created a task for you" and signed the note "Sarah drafted this SMS"
 * — an AI employee's name on work no AI did. Now it does one thing and says so.
 *
 * The title and note are written in the owner's language (this request's), not
 * stored as keys: the task becomes their record, and they edit it.
 */
export async function createFollowUpTask(
  clientId: string,
): Promise<{ status: "created" | "no_phone" | "error" }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { status: "error" };
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, first_name, last_name, company, phone")
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!client) return { status: "error" };

  const phone = normalizePhoneE164((client.phone as string | null) ?? "");
  if (!phone.ok) return { status: "no_phone" };

  const [{ data: org }, t] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    getServerT("tasks"),
  ]);

  const clientName =
    [client.first_name as string | null, client.last_name as string | null].filter(Boolean).join(" ") ||
    (client.company as string | null) ||
    phone.value;
  const message = t("generated.followUpMessage", {
    client_name: clientName,
    org: (org?.name as string | null) ?? "",
  });

  // RLS client: ask for the row back, so a refused insert is not reported as created.
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: orgId,
      client_id: clientId,
      title: t("generated.followUpWithClient", { client_name: clientName }),
      notes: t("generated.followUpNote", { phone: phone.value, message }),
      priority: "high",
      status: "open",
    })
    .select("id");
  if (error || !data?.length) {
    console.error("creating a follow-up task", error);
    return { status: "error" };
  }

  revalidatePath("/tasks");
  return { status: "created" };
}

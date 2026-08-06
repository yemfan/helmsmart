"use server";

/**
 * Disconnect a social channel — deletes the org's stored OAuth grant for a
 * provider. Connecting stays an OAuth redirect (GET /api/auth/<provider>);
 * this is the counterpart the Settings → Marketing UI calls to disconnect.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = new Set(["linkedin", "meta", "threads", "tiktok", "youtube"]);

export async function disconnectSocialProvider(
  provider: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!PROVIDERS.has(provider)) return { ok: false, error: "Unknown channel." };

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: "No organization selected." };

  const db = await createClient();
  const { error } = await db
    .from("org_oauth_tokens")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", provider);

  if (error) {
    console.error("disconnectSocialProvider error:", error.message);
    return { ok: false, error: "Couldn't disconnect that channel. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/social");
  return { ok: true };
}

"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UploadItem {
  kind: "image" | "manual";
  ext: string;
}
export interface UploadTarget {
  path: string;
  token: string;
  publicUrl: string;
}

/**
 * Mint signed upload URLs (service-role) so the browser can upload files
 * directly to Storage without relying on the authenticated-user INSERT policy.
 * Returns one target per input item, in order. Requires a signed-in seller;
 * files are namespaced under the seller's id.
 */
export async function signUploads(
  items: UploadItem[]
): Promise<{ ok: boolean; targets?: UploadTarget[]; message?: string }> {
  const db = await createClient();
  if (!db) return { ok: false, message: "Not configured." };
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Storage not configured." };

  if (items.length === 0) return { ok: true, targets: [] };
  if (items.length > 30) return { ok: false, message: "Too many files." };

  const prefix = `${user.id}/${randomUUID()}`;
  const bucket = admin.storage.from("guide-images");
  const targets: UploadTarget[] = [];

  for (let i = 0; i < items.length; i++) {
    const safeExt = (items[i].ext || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const path = `${prefix}/${items[i].kind}-${i}.${safeExt}`;
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) return { ok: false, message: "Could not prepare upload." };
    const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
    targets.push({ path: data.path, token: data.token, publicUrl });
  }

  return { ok: true, targets };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";

/**
 * Upload a profile picture to the "avatars" bucket (under the user's own folder) and
 * save its public URL to auth metadata (`avatar_url`), which the sidebar avatar reads.
 * Return type is inferred by the caller's useActionState — a "use server" module may
 * only export async functions, so no exported state type.
 */
export async function uploadAvatar(
  _: { error: string } | { ok: true; url: string } | null,
  formData: FormData
): Promise<{ error: string } | { ok: true; url: string } | null> {
  /*
   * The modal renders `state.error` verbatim, so every string here is copy the
   * reader sees — not an internal code. It shipped in English inside an
   * otherwise fully translated dialog, which is what a confirmed audit found
   * on a production build. Server actions run inside a request, so
   * `getServerT` resolves the reader's language here exactly as a page does.
   */
  const t = await getServerT("auth");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("avatar.errors.chooseFirst") };
  if (!file.type.startsWith("image/")) return { error: t("avatar.errors.notAnImage") };
  if (file.size > 2 * 1024 * 1024) return { error: t("avatar.errors.tooLarge") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("avatar.errors.notSignedIn") };

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  // Storage errors are Supabase's own English; the reader gets ours, the
  // detail goes to the log for whoever is debugging.
  if (upErr) {
    console.error("[profile] avatar upload failed:", upErr.message);
    return { error: t("avatar.errors.uploadFailed") };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
  if (metaErr) {
    console.error("[profile] avatar metadata update failed:", metaErr.message);
    return { error: t("avatar.errors.saveFailed") };
  }

  revalidatePath("/", "layout"); // refresh the sidebar avatar
  return { ok: true, url: publicUrl };
}

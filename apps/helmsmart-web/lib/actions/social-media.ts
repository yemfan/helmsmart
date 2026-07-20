"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Upload an image for a social post to the public "social-media" bucket (under the
 * user's own {user_id}/ folder) and return its public URL. The URL must be publicly
 * fetchable because Meta pulls the image server-side at publish time — an Instagram
 * image post won't work with a signed/private URL.
 *
 * JPEG is the safest format: Instagram's Content Publishing API only accepts JPEG for
 * image posts, so we steer uploads there and reject the formats Meta would bounce.
 */
export async function uploadSocialImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  // Instagram rejects PNG/WebP/HEIC for feed images — only JPEG publishes reliably.
  if (!/^image\/(jpe?g)$/i.test(file.type)) {
    return { error: "Use a JPG image — Instagram only accepts JPEG for photo posts." };
  }
  if (file.size > 8 * 1024 * 1024) return { error: "Image must be under 8 MB." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const path = `${user.id}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("social-media")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (upErr) return { error: upErr.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("social-media").getPublicUrl(path);
  return { url: publicUrl };
}

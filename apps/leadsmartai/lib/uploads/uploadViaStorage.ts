import { createClient } from "@/lib/supabase/client";

/**
 * Browser helper: upload a file straight to Supabase Storage (bypassing Vercel's
 * ~4.5 MB serverless request-body cap), returning the storage path the consuming
 * API route reads back. Pair with `resolveUpload` on the server.
 *
 *   const path = await uploadViaStorage(file, "listing_pdf");
 *   await fetch(route, { method: "POST", headers: {"content-type":"application/json"},
 *                        body: JSON.stringify({ storagePath: path, fileName: file.name, mime: file.type }) });
 *
 * `kind` must be one of the kinds the /uploads/sign route recognizes. Throws on
 * failure so callers can surface the message in their existing catch.
 */
export async function uploadViaStorage(file: File, kind: string): Promise<string> {
  const supa = createClient();
  if (!supa) throw new Error("Upload is unavailable in this environment.");

  const signRes = await fetch("/api/dashboard/uploads/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, fileName: file.name }),
  });
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Upload failed");

  const up = await supa.storage
    .from(sign.bucket)
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message || "Upload failed");

  return sign.path as string;
}

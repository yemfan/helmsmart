import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resolve an uploaded file from EITHER a direct-to-Storage reference or a
 * multipart body — the server side of the pattern that dodges Vercel's ~4.5 MB
 * serverless request-body cap.
 *
 *   - JSON { storagePath } → the browser uploaded straight to the private
 *     `lead-media` bucket (via /api/dashboard/uploads/sign); we read it back
 *     here and delete it after processing (call `cleanup()`).
 *   - multipart `file`     → legacy/small-file path, still supported.
 *
 * `pathPrefix` scopes which stored objects a caller may read (e.g.
 * `listings/<agentId>/`) so one agent can't reference another's upload.
 */

const BUCKET = "lead-media";

export type ResolvedUpload =
  | {
      ok: true;
      bytes: Uint8Array;
      name: string;
      mime: string;
      size: number;
      /** Read a sibling field (multipart form field or JSON body key). */
      field: (name: string) => string | null;
      /** Best-effort removal of the temp storage object; no-op for multipart. */
      cleanup: () => Promise<void>;
    }
  | { ok: false; status: 400 | 403; error: string };

export async function resolveUpload(req: Request, pathPrefix: string): Promise<ResolvedUpload> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as {
      storagePath?: unknown;
      fileName?: unknown;
      mime?: unknown;
    };
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
    if (!storagePath) return { ok: false, status: 400, error: "Missing storagePath" };
    if (!storagePath.startsWith(pathPrefix)) {
      return { ok: false, status: 403, error: "Invalid storage path" };
    }
    const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
    if (error || !blob) {
      return { ok: false, status: 400, error: "Uploaded file could not be read. Try again." };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = typeof body.fileName === "string" ? body.fileName : "upload";
    const mime = typeof body.mime === "string" && body.mime ? body.mime : blob.type || "";
    const bag = body as Record<string, unknown>;
    return {
      ok: true,
      bytes,
      name,
      mime,
      size: bytes.length,
      field: (k) => (typeof bag[k] === "string" ? (bag[k] as string) : null),
      cleanup: async () => {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      },
    };
  }

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("file");
    if (!f || !(f instanceof File)) {
      return { ok: false, status: 400, error: "Missing file field." };
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    return {
      ok: true,
      bytes,
      name: f.name,
      mime: f.type,
      size: bytes.length,
      field: (k) => {
        const v = form.get(k);
        return typeof v === "string" ? v : null;
      },
      cleanup: async () => {},
    };
  }

  return { ok: false, status: 400, error: "Expected a multipart file or a JSON storage reference." };
}

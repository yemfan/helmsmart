import "server-only";

/**
 * Fetches a single Street View photo of the subject property for the
 * professional CMA report. Returns a base64 data URL (JPEG) jsPDF can
 * embed directly, or null when no usable imagery / key is available —
 * the report renders fine without it.
 *
 * Key resolution: prefer GOOGLE_MAPS_SERVER_KEY (unrestricted server
 * key, like propertytoolsai uses), fall back to the public maps key.
 * Note a referrer-restricted public key will fail server-side; that's
 * why we degrade gracefully instead of surfacing an error.
 *
 * We check the metadata endpoint first — the Street View Static API
 * returns a gray "no imagery" placeholder (HTTP 200) rather than an
 * error when a location has no coverage, so metadata is the only
 * reliable way to know whether a real photo exists.
 */

export type SubjectPhoto = {
  /** data:image/jpeg;base64,... — ready for jsPDF addImage. */
  dataUrl: string;
  width: number;
  height: number;
};

const PHOTO_W = 640;
const PHOTO_H = 400;

function resolveKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export async function fetchSubjectPhoto(
  address: string,
): Promise<SubjectPhoto | null> {
  const key = resolveKey();
  const loc = address.trim();
  if (!key || !loc) return null;

  try {
    // 1. Metadata — confirm real coverage before fetching the image.
    const metaUrl =
      "https://maps.googleapis.com/maps/api/streetview/metadata" +
      `?size=${PHOTO_W}x${PHOTO_H}&location=${encodeURIComponent(loc)}&key=${key}`;
    const metaRes = await fetch(metaUrl, { cache: "no-store" });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json().catch(() => null)) as
      | { status?: string }
      | null;
    if (!meta || meta.status !== "OK") return null;

    // 2. The image itself.
    const imgUrl =
      "https://maps.googleapis.com/maps/api/streetview" +
      `?size=${PHOTO_W}x${PHOTO_H}&location=${encodeURIComponent(loc)}` +
      `&fov=80&pitch=0&key=${key}`;
    const imgRes = await fetch(imgUrl, { cache: "no-store" });
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length === 0) return null;

    return {
      dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
      width: PHOTO_W,
      height: PHOTO_H,
    };
  } catch {
    return null;
  }
}

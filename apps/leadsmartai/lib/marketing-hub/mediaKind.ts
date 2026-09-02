/**
 * Whether a post's media is a still or a video.
 *
 * `scheduled_posts.image_url` holds both. A rendered reel puts its MP4 in the
 * column named for images, and the hub trusted the name — it dropped the value
 * straight into `next/image`, and a browser handed an MP4 in an <img> draws
 * the broken-image icon. One published post on the live hub pointed at
 * `…/renders/yq8bgykhpa/out.mp4` and read as broken while the video was fine.
 *
 * WHY NOT A NEW COLUMN. The obvious repair is a `media_kind` column, and it is
 * the wrong one: the row already says what it is. `subject_kind` is set by the
 * pipeline that created the post, and the publisher has always relied on it —
 *
 *     mediaKind: row.subject_kind === "social_reel" ? "video" : "image"
 *
 * — it was simply never shared with anything else. Adding a second column
 * would create two facts that can disagree, plus a backfill and a write path
 * to keep in step forever. Production agrees with the existing one exactly:
 * all 13 `social_reel` rows carry a video URL, and no row of any other kind
 * does. So this centralises the rule that already existed rather than
 * inventing a parallel one.
 *
 * The URL extension is a FALLBACK, for rows whose `subject_kind` is null and
 * for the hub's other two sources, which have no such column.
 */

export type MediaKind = "image" | "video" | "none";

/** `scheduled_posts.subject_kind` values whose media is a video. */
const VIDEO_SUBJECT_KINDS = new Set(["social_reel"]);

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|ogv|avi)(?:$|[?#])/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(?:$|[?#])/i;

export function postMediaKind(input: {
  url: string | null | undefined;
  /** `scheduled_posts.subject_kind`, when the row has one. Authoritative. */
  subjectKind?: string | null;
}): MediaKind {
  const u = (input.url ?? "").trim();
  if (!u) return "none";

  // What the row says it is beats what the filename looks like: the pipeline
  // knew, and a signed or extensionless URL can hide the extension entirely.
  if (VIDEO_SUBJECT_KINDS.has((input.subjectKind ?? "").trim())) return "video";

  if (VIDEO_EXT.test(u)) return "video";
  if (IMAGE_EXT.test(u)) return "image";
  /*
   * No recognisable extension — our own generated-ad endpoints
   * (/api/social/ad/<id>, /api/social/card/<id>) are the common case, and they
   * serve images. Guessing "image" is also the safe direction: an <img>
   * pointed at something unexpected degrades to one broken frame, whereas a
   * <video> pointed at a PNG renders a black box with playback controls on it.
   */
  return "image";
}

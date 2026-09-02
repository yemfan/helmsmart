/**
 * What kind of media a hub post's `image_url` actually points at.
 *
 * The column is named `image_url`, and the hub trusted the name: both render
 * sites dropped the value straight into `next/image`. But a reel or a rendered
 * video ad stores its MP4 there — one real post on the live hub points at
 * `…/renders/yq8bgykhpa/out.mp4` — and a browser handed an MP4 in an <img>
 * draws the broken-image icon. The post looked broken; the video was fine.
 *
 * The feed already meant to avoid this: its comment says "Null renders as a
 * text card rather than a broken frame." It just had no way to tell that a
 * non-null URL was not an image.
 *
 * Extension-based on purpose. The alternative is a HEAD request per item at
 * render time on a public, cached, SEO-indexed page — cost and a failure mode
 * for no more certainty, since these URLs come from our own renderers and
 * uploaders and carry real extensions.
 */

export type MediaKind = "image" | "video" | "none";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|ogv|avi)(?:$|[?#])/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(?:$|[?#])/i;

export function mediaKind(url: string | null | undefined): MediaKind {
  const u = (url ?? "").trim();
  if (!u) return "none";
  if (VIDEO_EXT.test(u)) return "video";
  if (IMAGE_EXT.test(u)) return "image";
  /*
   * No recognisable extension — our own generated-ad endpoints
   * (/api/social/ad/<id>, /api/social/card/<id>) are the common case, and they
   * serve images. Guessing "image" here is also the safe direction: an image
   * tag pointed at something unexpected degrades to one broken frame, whereas
   * a <video> pointed at a PNG renders a black box with controls on it.
   */
  return "image";
}

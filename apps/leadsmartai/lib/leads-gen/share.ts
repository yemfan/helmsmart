/**
 * Platform-native share URL builders for the Quick Post wizard.
 *
 * Phase 1 doesn't post directly to any platform — that needs OAuth +
 * Meta Business App approval (in flight). Instead, each "Share to X"
 * button opens the platform's official compose page with the caption
 * pre-filled, so the agent confirms and posts inside the platform.
 *
 * Behavior per platform:
 *   - Facebook: `sharer.php?u=<url>&quote=<caption>` — opens FB
 *     share dialog with the caption in the quote field. Requires a
 *     `linkUrl` (FB sharer is link-centric; if none provided, we
 *     share the agent's website root or a configured fallback).
 *   - X (Twitter): `intent/tweet?text=<caption>&url=<url>` — opens
 *     the compose dialog with text + optional link.
 *   - LinkedIn: `sharing/share-offsite?url=<url>` — LinkedIn share
 *     dialog is link-centric and does NOT honor a prefilled body
 *     (LinkedIn deprecated `title`/`summary` params in 2024). The
 *     caption is also returned for the UI to render a "copy caption"
 *     button next to the share link.
 *   - Instagram: there is no web-compose URL, period. We return a
 *     null `composeUrl` and the UI shows "Copy caption + download
 *     image, then post from the Instagram app." Phase 2 replaces
 *     this with Meta Graph API direct posting.
 */

import type { Platform } from "./draft";

export type ComposeInstruction = {
  platform: Platform;
  /** Direct compose-URL to open in a new tab. Null = no web compose; agent must copy/paste manually. */
  composeUrl: string | null;
  /** Always returned so the UI can render a Copy button (especially needed when composeUrl is null OR when the platform doesn't prefill the body, like LinkedIn). */
  caption: string;
  /** Hashtags appended to the caption only when the platform honors them inline (Instagram does; the others get them returned separately for the Copy button). */
  hashtags: string[];
  /** Optional landing URL — the deep link inside the compose. Defaults to the agent's site root. */
  shareUrl: string | null;
  /** When true, the UI should explain "the link doesn't pre-fill the body — use Copy then paste." Currently: LinkedIn + Instagram. */
  prefillsBody: boolean;
};

export type BuildComposeInput = {
  platform: Platform;
  caption: string;
  hashtags: string[];
  /**
   * Landing URL the share button drops in (the MLS link, listing
   * page, agent site, etc.). May be null — Facebook still works
   * but only as a status share without the link card; the other
   * platforms fall back to a configurable default site URL.
   */
  shareUrl?: string | null;
  /** Fallback share URL when none is passed in (typically the agent's marketing site root). */
  fallbackShareUrl?: string | null;
};

export function buildComposeInstruction(
  input: BuildComposeInput,
): ComposeInstruction {
  const { platform, caption, hashtags } = input;
  const shareUrl = input.shareUrl?.trim() || input.fallbackShareUrl?.trim() || null;

  switch (platform) {
    case "facebook": {
      // FB Sharer dialog accepts `u` (required) + `quote` (caption).
      // We pass the share URL OR a sensible fallback; the agent can
      // remove the link card inside FB if they don't want it.
      const u = shareUrl ?? "https://www.realtybossai.com";
      const composeUrl =
        "https://www.facebook.com/sharer/sharer.php?" +
        `u=${encodeURIComponent(u)}` +
        `&quote=${encodeURIComponent(caption)}`;
      return {
        platform,
        composeUrl,
        caption,
        hashtags,
        shareUrl,
        prefillsBody: true,
      };
    }

    case "x": {
      // X compose intent honors both `text` and `url`. We append the
      // most relevant hashtags inline (X is 280 chars total, so we
      // can't dump 8-12 like Instagram).
      const inlineTags = hashtags.slice(0, 2).map((t) => `#${t}`).join(" ");
      const composedText = inlineTags ? `${caption} ${inlineTags}` : caption;
      const composeUrl =
        "https://x.com/intent/tweet?" +
        `text=${encodeURIComponent(composedText)}` +
        (shareUrl ? `&url=${encodeURIComponent(shareUrl)}` : "");
      return {
        platform,
        composeUrl,
        caption: composedText,
        hashtags,
        shareUrl,
        prefillsBody: true,
      };
    }

    case "linkedin": {
      // LinkedIn deprecated the body-prefilling `title`/`summary`
      // params in 2024 — the share dialog only honors `url`. The
      // agent has to paste the caption from the Copy button. Be
      // explicit about this in the UI (`prefillsBody: false`) so
      // the agent isn't confused when their post body is empty.
      const u = shareUrl ?? "https://www.realtybossai.com";
      const composeUrl =
        "https://www.linkedin.com/sharing/share-offsite/?" +
        `url=${encodeURIComponent(u)}`;
      return {
        platform,
        composeUrl,
        caption,
        hashtags,
        shareUrl: u,
        prefillsBody: false,
      };
    }

    case "instagram": {
      // No web compose URL exists for Instagram. The wizard renders
      // a "Copy caption + download image" pair and tells the agent
      // to post from the mobile app. Phase 2 replaces this with
      // Meta Graph API direct posting (image + caption via
      // /v18.0/{ig-user-id}/media + /media_publish).
      return {
        platform,
        composeUrl: null,
        caption,
        hashtags,
        shareUrl,
        prefillsBody: false,
      };
    }
  }
}

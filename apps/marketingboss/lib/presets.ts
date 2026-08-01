/**
 * MarketingBoss AI — one-click marketing presets. Each preset drops a strong
 * starter prompt into the composer and sets the right mode + aspect for the
 * format (feed vs story vs thumbnail vs clip). `[bracketed]` bits are hints the
 * user swaps for their own product/subject before generating.
 */

export type PresetMode = "image" | "video";
export type PresetAspect = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export type Preset = {
  id: string;
  label: string;
  emoji: string;
  mode: PresetMode;
  aspect: PresetAspect;
  prompt: string;
};

export const PRESETS: Preset[] = [
  {
    id: "product",
    label: "Product shot",
    emoji: "📦",
    mode: "image",
    aspect: "1:1",
    prompt:
      "Studio product hero shot of a [product] on wet stone, soft rim lighting, water droplets, shallow depth of field, editorial, premium teal-and-amber grade",
  },
  {
    id: "ad",
    label: "Social ad",
    emoji: "📣",
    mode: "image",
    aspect: "1:1",
    prompt:
      "Bold social media ad: [subject] on a vibrant [color] background, punchy colors, dynamic composition, generous negative space for a headline, high-end commercial photography",
  },
  {
    id: "story",
    label: "Story / Reel",
    emoji: "📱",
    mode: "image",
    aspect: "9:16",
    prompt:
      "Vertical story visual: [subject], cinematic lighting, one bold focal point, clean space at the top and bottom for text overlays, scroll-stopping",
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    emoji: "▶️",
    mode: "image",
    aspect: "16:9",
    prompt:
      "YouTube thumbnail: [subject] with an expressive focal point, high contrast, saturated colors, dramatic lighting, bold and clickable, space for large text",
  },
  {
    id: "realestate",
    label: "Real estate",
    emoji: "🏡",
    mode: "image",
    aspect: "16:9",
    prompt:
      "Cinematic real-estate twilight exterior of a [modern hillside] home, warm interior glow, manicured landscaping, dramatic sky, wide 24mm, luxury listing photography",
  },
  {
    id: "promo",
    label: "Promo clip",
    emoji: "🎬",
    mode: "video",
    aspect: "16:9",
    prompt:
      "Cinematic promo clip: slow push-in on [subject], soft studio lighting, subtle natural motion, premium commercial feel",
  },
];

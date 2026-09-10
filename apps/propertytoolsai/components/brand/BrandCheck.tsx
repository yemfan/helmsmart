/** Shared with CloseBoss — brand-colored ✓ chips for lists & CTAs */

export const BRAND = {
  primary: "#0072ce",
  primaryDark: "#005ca8",
  success: "#28a745",
  accent: "#ff8c42",
} as const;

export type BrandTone = keyof typeof BRAND;

export const BRAND_CHECK_TONES: BrandTone[] = ["primary", "primaryDark", "success", "accent"];

export function toneAt(index: number): BrandTone {
  return BRAND_CHECK_TONES[index % BRAND_CHECK_TONES.length]!;
}

export function BrandCheck({
  tone,
  size = "sm",
}: {
  tone: BrandTone;
  size?: "sm" | "md";
}) {
  const bg = BRAND[tone];
  const box = size === "md" ? "h-7 w-7 text-xs" : "h-5 w-5 text-[10px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm ring-2 ring-white/90 ${box}`}
      style={{ backgroundColor: bg }}
      aria-hidden
    >
      ✓
    </span>
  );
}

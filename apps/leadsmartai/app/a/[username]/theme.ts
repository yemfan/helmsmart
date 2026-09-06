import type { HubAccent } from "@/lib/marketing-hub/config";

/**
 * The agent's chosen accent, as the handful of classes the page needs.
 *
 * Five accents, all on a white page: the ground stays neutral so the agent's
 * photo and words carry the identity, and the accent shows up where a
 * visitor is meant to act. Every pair below clears WCAG AA on white.
 */
export type HubTheme = {
  /** Solid primary button. */
  primary: string;
  /** Secondary button — outlined, on white. */
  secondary: string;
  /** Small text and icons in the accent. */
  text: string;
  /** Soft tinted surface (kicker chips, icon tiles). */
  tint: string;
  /** Focus ring colour. */
  ring: string;
  /** Dark band (final CTA). */
  band: string;
  /** Button on the dark band. */
  bandButton: string;
};

const THEMES: Record<HubAccent, HubTheme> = {
  navy: {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    text: "text-slate-700",
    tint: "bg-slate-100 text-slate-800",
    ring: "focus-visible:ring-slate-500",
    band: "bg-slate-900 text-white",
    bandButton: "bg-white text-slate-900 hover:bg-slate-100",
  },
  blue: {
    primary: "bg-[#0072ce] text-white hover:bg-[#005ca8]",
    secondary: "bg-white text-[#005ca8] ring-1 ring-inset ring-[#0072ce]/40 hover:bg-blue-50",
    text: "text-[#005ca8]",
    tint: "bg-blue-50 text-[#005ca8]",
    ring: "focus-visible:ring-[#0072ce]",
    band: "bg-[#0b2f5b] text-white",
    bandButton: "bg-white text-[#0b2f5b] hover:bg-blue-50",
  },
  emerald: {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800",
    secondary: "bg-white text-emerald-800 ring-1 ring-inset ring-emerald-600/40 hover:bg-emerald-50",
    text: "text-emerald-800",
    tint: "bg-emerald-50 text-emerald-800",
    ring: "focus-visible:ring-emerald-600",
    band: "bg-emerald-900 text-white",
    bandButton: "bg-white text-emerald-900 hover:bg-emerald-50",
  },
  gold: {
    primary: "bg-amber-500 text-slate-950 hover:bg-amber-400",
    secondary: "bg-white text-slate-900 ring-1 ring-inset ring-amber-500/60 hover:bg-amber-50",
    text: "text-amber-800",
    tint: "bg-amber-50 text-amber-900",
    ring: "focus-visible:ring-amber-500",
    band: "bg-slate-900 text-white",
    bandButton: "bg-amber-400 text-slate-950 hover:bg-amber-300",
  },
  slate: {
    primary: "bg-slate-700 text-white hover:bg-slate-600",
    secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    text: "text-slate-600",
    tint: "bg-slate-100 text-slate-700",
    ring: "focus-visible:ring-slate-400",
    band: "bg-slate-800 text-white",
    bandButton: "bg-white text-slate-900 hover:bg-slate-100",
  },
};

export function hubTheme(accent: HubAccent): HubTheme {
  return THEMES[accent] ?? THEMES.navy;
}

export const BTN =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-11 sm:text-sm";
export const BTN_SM =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

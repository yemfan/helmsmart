/**
 * CloseBoss design tokens — the one place the palette is written down.
 *
 * Two readers, two encodings of the same colours:
 *   - the Expo app imports the hex ramps straight into its theme
 *     (apps/leadsmart-mobile/lib/theme.ts);
 *   - the web app's Tailwind theme (apps/leadsmartai/app/globals.css)
 *     carries the OKLCH ramp, and a test holds that CSS to the strings
 *     here, so a tweak on one platform cannot quietly drift from the other.
 *
 * Adding a step or an accent: change it here first, then let the drift test
 * tell you which app disagrees. Never hand-edit a ramp in an app.
 */

export type RampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type Ramp = Record<RampStep, string>;

export const RAMP_STEPS: readonly RampStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Brand blue, anchored at 500 = #0072ce. Light-mode ladder. */
export const brand: Ramp = {
  50: "#ebf5fc",
  100: "#d6ebf9",
  200: "#a8d4f1",
  300: "#6fb6e6",
  400: "#3093d9",
  500: "#0072ce",
  600: "#005ca8",
  700: "#00477f",
  800: "#003560",
  900: "#002543",
  950: "#00172d",
};

/** The same ladder inverted for dark surfaces (50 is the darkest). */
export const brandDark: Ramp = {
  50: brand[950],
  100: brand[900],
  200: brand[800],
  300: brand[700],
  400: brand[600],
  500: brand[500],
  600: brand[400],
  700: brand[300],
  800: brand[200],
  900: brand[100],
  950: brand[50],
};

/** Neutral (slate) ladder shared by both apps. */
export const neutral: Ramp = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
  950: "#020617",
};

/**
 * The web ramp as Tailwind v4 reads it — perceptually uniform OKLCH, so the
 * steps are evenly spaced to the eye. These are the strings globals.css must
 * contain, verbatim.
 */
export const brandOklch: Ramp = {
  50: "oklch(0.97 0.018 248)",
  100: "oklch(0.93 0.04 248)",
  200: "oklch(0.86 0.075 248)",
  300: "oklch(0.77 0.115 248)",
  400: "oklch(0.68 0.155 248)",
  500: "oklch(0.59 0.18 248)",
  600: "oklch(0.51 0.185 248)",
  700: "oklch(0.43 0.175 250)",
  800: "oklch(0.36 0.155 252)",
  900: "oklch(0.28 0.125 254)",
  950: "oklch(0.20 0.085 254)",
};

export const neutralOklch: Ramp = {
  50: "oklch(0.985 0.003 270)",
  100: "oklch(0.965 0.005 270)",
  200: "oklch(0.925 0.007 270)",
  300: "oklch(0.875 0.01 270)",
  400: "oklch(0.77 0.012 270)",
  500: "oklch(0.62 0.014 270)",
  600: "oklch(0.50 0.015 270)",
  700: "oklch(0.40 0.014 270)",
  800: "oklch(0.30 0.012 270)",
  900: "oklch(0.22 0.009 270)",
  950: "oklch(0.15 0.006 270)",
};

/** Flat semantic colours both apps name the same way. */
export const semantic = {
  /** Buttons, links, the active row. */
  primary: "#0072ce",
  primaryHover: "#005ca8",
  /** Brand orange — fills, icons, graphics only; 2.1:1 on white. */
  accent: "#ff8c42",
  /** The ONLY orange allowed on text and small labels in light mode (5.03:1 on white). */
  accentText: "#b45309",
  /** On dark surfaces the bright orange is what reads (7.7:1 on slate-900). */
  accentTextDark: "#ff8c42",
  success: "#28a745",
  /** Emerald-500 / slate-300 — the house toggle, on and off. */
  toggleOn: "#10b981",
  toggleOff: "#cbd5e1",
} as const;

/** Corner radius scale, px. Cards and inputs are lg; sheets and dialogs 2xl. */
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, "2xl": 20, full: 9999 } as const;

/**
 * Colour theme preference — light, dark, or follow the OS.
 *
 * Dark mode is opt-in through a `.dark` class on <html> (Tailwind's `dark:`
 * variant is bound to that class in globals.css), not to the OS setting on
 * its own. Before this, `dark:` classes were media-driven and only a handful
 * of components carried them, so an agent whose phone was in dark mode got
 * dark buttons and dialogs on light pages. Now the OS setting counts only
 * when the agent picks "System".
 *
 * The preference is a device setting, so it lives in a cookie (read by the
 * server for the first paint) mirrored to localStorage (read by the inline
 * script below before hydration, which is what prevents a light flash).
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_COOKIE = "cb_theme";
export const THEME_STORAGE_KEY = "cb_theme";
export const THEME_VALUES: readonly ThemePreference[] = ["light", "dark", "system"];

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (THEME_VALUES as readonly string[]).includes(v);
}

/** Class list for <html> given the cookie value — "system" is resolved by the inline script. */
export function htmlClassForTheme(pref: ThemePreference | null | undefined): string {
  return pref === "dark" ? "dark" : "";
}

/**
 * Runs before React: applies `.dark` when the stored preference is "dark",
 * or "system" with a dark OS. Kept tiny and dependency-free on purpose.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var p=localStorage.getItem(k);if(!p){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);p=m?decodeURIComponent(m[1]):null;}var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

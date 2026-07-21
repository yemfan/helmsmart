import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * End the Supabase session and navigate with a full page load.
 *
 * With `@supabase/ssr` cookie sessions, `router.push` + `router.refresh` alone can leave
 * the UI or middleware thinking the user is still signed in. A hard navigation matches
 * the pattern used elsewhere (e.g. PropertyTools `LogoutButton`) and reloads cookies + RSC.
 */
export async function signOutWithFullReload(nextPath = "/") {
  try {
    // `scope: "local"` clears this browser's session cookies without the
    // server round-trip that `global` (the default) makes — that call can
    // reject or, worse, never settle (supabase-js serializes auth ops
    // behind a navigator lock another tab may hold), which left the
    // button doing nothing. The timeout race guarantees we always reach
    // the hard navigation below.
    await Promise.race([
      supabaseBrowser().auth.signOut({ scope: "local" }),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (e) {
    console.error("signOut failed", e);
  }
  // Belt-and-suspenders: when the race above times out (the navigator lock
  // delayed signOut's `removeItem`), the `@supabase/ssr` session cookies
  // survive and the server keeps seeing a logged-in user on the next load —
  // i.e. "Log out does nothing." Those cookies are not httpOnly, so expire
  // them explicitly here before the hard navigation.
  clearSupabaseAuthCookies();
  if (typeof window !== "undefined") {
    window.location.assign(nextPath);
  }
}

/**
 * Expire every Supabase auth cookie (`sb-<ref>-auth-token`, including the
 * chunked `.0`/`.1` variants) across the path/domain combinations they might
 * have been written with. No-op outside the browser.
 */
function clearSupabaseAuthCookies() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const past = "Thu, 01 Jan 1970 00:00:00 GMT";
  const host = window.location.hostname;
  // e.g. "www.closebossai.com" -> also try the registrable base ".closebossai.com"
  const parts = host.split(".");
  const baseDomain = parts.length > 2 ? "." + parts.slice(-2).join(".") : host;

  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => Boolean(n) && /^sb-.*-auth-token/.test(n));

  for (const name of names) {
    const base = `${name}=; expires=${past}; max-age=0; path=/`;
    document.cookie = base;
    document.cookie = `${base}; domain=${host}`;
    if (baseDomain !== host) document.cookie = `${base}; domain=${baseDomain}`;
  }
}

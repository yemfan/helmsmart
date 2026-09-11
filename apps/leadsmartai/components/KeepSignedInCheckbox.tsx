"use client";

import { useEffect, useState } from "react";
import { KEEP_SIGNED_IN_COOKIE, keepSignedInCookie, keepSignedInFrom, readCookieValue } from "@/lib/auth/keepSignedIn";

/**
 * "Keep me signed in on this device" on the sign-in forms.
 *
 * Ticked (the default) keeps the session for as long as the browser allows;
 * unticked makes the sign-in cookies end when the browser closes. The choice
 * is its own cookie on this device, written the moment the box changes, so it
 * holds for email, Google and Apple sign-in alike: the OAuth callback reads it
 * on the way back from the provider.
 */
export function KeepSignedInCheckbox({ label }: { label: string }) {
  const [keep, setKeep] = useState(true);

  useEffect(() => {
    try {
      setKeep(keepSignedInFrom(readCookieValue(document.cookie, KEEP_SIGNED_IN_COOKIE)));
    } catch {
      /* cookies unavailable: the default applies */
    }
  }, []);

  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-gray-700">
      <input
        type="checkbox"
        checked={keep}
        onChange={(e) => {
          const next = e.target.checked;
          setKeep(next);
          try {
            document.cookie = keepSignedInCookie(next, {
              secure: window.location.protocol === "https:",
              domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim() || undefined,
            });
          } catch {
            /* cookies blocked: the default applies */
          }
        }}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
      />
      {label}
    </label>
  );
}

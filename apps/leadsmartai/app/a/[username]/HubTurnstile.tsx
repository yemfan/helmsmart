"use client";

import Script from "next/script";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Invisible Cloudflare Turnstile for the hub's forms and chat.
 *
 * Renders nothing the visitor has to solve: the widget runs in the
 * background and hands the form a token on demand. When no site key is
 * configured the provider is a no-op and `getToken()` resolves to null, so
 * the forms behave exactly as before and the server skips verification.
 *
 * One widget per page, shared through context, so four forms do not load
 * four challenges.
 */

type Turnstile = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      execution?: "render" | "execute";
      appearance?: "always" | "execute" | "interaction-only";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

type Ctx = { enabled: boolean; getToken: () => Promise<string | null> };
const TurnstileContext = createContext<Ctx>({ enabled: false, getToken: async () => null });

export function useTurnstile(): Ctx {
  return useContext(TurnstileContext);
}

export function HubTurnstileProvider({ siteKey, children }: { siteKey: string | null; children: ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const waiters = useRef<Array<(t: string | null) => void>>([]);
  const [ready, setReady] = useState(false);

  const flush = useCallback((token: string | null) => {
    const list = waiters.current;
    waiters.current = [];
    for (const w of list) w(token);
  }, []);

  useEffect(() => {
    if (!siteKey || !ready || widgetId.current || !holder.current || !window.turnstile) return;
    try {
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token) => flush(token),
        "error-callback": () => flush(null),
        "expired-callback": () => {
          /* the next getToken() re-executes */
        },
      });
    } catch {
      widgetId.current = null;
    }
  }, [siteKey, ready, flush]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    const ts = window.turnstile;
    const id = widgetId.current;
    if (!ts || !id) return null;
    return new Promise<string | null>((resolve) => {
      waiters.current.push(resolve);
      // A challenge that never answers must not hold a form hostage.
      window.setTimeout(() => {
        if (waiters.current.includes(resolve)) {
          waiters.current = waiters.current.filter((w) => w !== resolve);
          resolve(null);
        }
      }, 8000);
      try {
        ts.reset(id);
        ts.execute(id);
      } catch {
        flush(null);
      }
    });
  }, [siteKey, flush]);

  return (
    <TurnstileContext.Provider value={{ enabled: Boolean(siteKey), getToken }}>
      {siteKey ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={() => setReady(true)}
          />
          <div ref={holder} aria-hidden className="fixed bottom-0 left-0 h-0 w-0 overflow-hidden" />
        </>
      ) : null}
      {children}
    </TurnstileContext.Provider>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

/**
 * Cookie consent banner — per TOM validation report recommendation.
 *
 * GDPR + CCPA default: non-essential categories are OFF until the user
 * opts in. "Essential" cookies (auth session, CSRF, preferences that make
 * the site usable) are always on — documented in the privacy policy.
 *
 * Categories:
 *   necessary   — always true, not user-controllable
 *   analytics   — product analytics, error monitoring
 *   marketing   — ad retargeting, marketing attribution
 *
 * Storage:
 *   localStorage key `ls_cookie_consent` holds the serialized state so
 *   downstream components can read it synchronously.
 *   First-party cookie `ls_cookie_consent` (same JSON value) so server
 *   code can honor it on SSR.
 *
 * Consumers: call `useCookieConsent()` to read the current state and
 * register listeners. Analytics loaders should gate behind
 * `consent.categories.analytics === true` before initializing.
 */

const STORAGE_KEY = "ls_cookie_consent";
const COOKIE_KEY = "ls_cookie_consent";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const CURRENT_VERSION = "1";

export type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentState = {
  version: string;
  acceptedAt: string;
  categories: ConsentCategories;
};

const DEFAULT_DENIED: ConsentState = {
  version: CURRENT_VERSION,
  acceptedAt: "",
  categories: { necessary: true, analytics: false, marketing: false },
};

type ConsentContextValue = {
  /** Null until first hydration. Use `ready` to tell if we've read storage yet. */
  state: ConsentState | null;
  ready: boolean;
  hasDecided: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (categories: Omit<ConsentCategories, "necessary">) => void;
  reopen: () => void;
};

const CookieConsentContext = createContext<ConsentContextValue | null>(null);

function loadFromStorage(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      "categories" in parsed
    ) {
      // Discard stored state if the version has rolled forward — forces
      // re-consent when we materially change disclosure language.
      const state = parsed as ConsentState;
      if (state.version !== CURRENT_VERSION) return null;
      return {
        ...state,
        categories: { ...state.categories, necessary: true },
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

/**
 * Synchronous consent check for non-React callers (analytics loaders, the
 * trackLandingEvent helper, etc.). Returns false on the server and when
 * storage access fails — safer default.
 *
 * Example:
 *   import { hasConsent } from "@/components/cookie-consent/CookieConsent";
 *   if (hasConsent("analytics")) window.gtag?.("event", name, props);
 */
export function hasConsent(category: "analytics" | "marketing"): boolean {
  const state = loadFromStorage();
  if (!state) return false;
  return state.categories[category] === true;
}

function persist(state: ConsentState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // ignore
  }
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const loaded = loadFromStorage();
    setState(loaded);
    setReady(true);
    if (!loaded) setShowBanner(true);
  }, []);

  const commit = useCallback((next: ConsentState) => {
    setState(next);
    persist(next);
    setShowBanner(false);
  }, []);

  const acceptAll = useCallback(() => {
    commit({
      version: CURRENT_VERSION,
      acceptedAt: new Date().toISOString(),
      categories: { necessary: true, analytics: true, marketing: true },
    });
  }, [commit]);

  const rejectAll = useCallback(() => {
    commit({
      version: CURRENT_VERSION,
      acceptedAt: new Date().toISOString(),
      categories: { necessary: true, analytics: false, marketing: false },
    });
  }, [commit]);

  const save = useCallback(
    (categories: Omit<ConsentCategories, "necessary">) => {
      commit({
        version: CURRENT_VERSION,
        acceptedAt: new Date().toISOString(),
        categories: { necessary: true, ...categories },
      });
    },
    [commit],
  );

  const reopen = useCallback(() => setShowBanner(true), []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      state,
      ready,
      hasDecided: !!state?.acceptedAt,
      acceptAll,
      rejectAll,
      save,
      reopen,
    }),
    [state, ready, acceptAll, rejectAll, save, reopen],
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      {ready && showBanner ? <CookieConsentBanner /> : null}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent(): ConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    // Return a dummy state-less value rather than throwing — components
    // rendered outside the provider (tests, snapshots) get a safe default.
    return {
      state: null,
      ready: false,
      hasDecided: false,
      acceptAll: () => {},
      rejectAll: () => {},
      save: () => {},
      reopen: () => {},
    };
  }
  return ctx;
}

/**
 * Controlled banner — rendered by the provider when the user hasn't decided
 * yet or clicked "Cookie settings". Kept internal so pages don't double-mount
 * it.
 */
function CookieConsentBanner() {
  const { t } = useTranslation("dashboard");
  const { state, acceptAll, rejectAll, save } = useCookieConsent();
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(state?.categories.analytics ?? false);
  const [marketing, setMarketing] = useState(state?.categories.marketing ?? false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the card for screen-reader announcement + keyboard users.
    cardRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 pt-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-lg"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-900/5 outline-none"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0072ce]/10 text-sm"
          >
            🍪
          </span>
          <div className="flex-1">
            <h2
              id="cookie-consent-title"
              className="text-sm font-semibold text-slate-900"
            >{t("pages.cookieConsent.title")}</h2>
            <p id="cookie-consent-description" className="mt-1 text-xs leading-relaxed text-slate-600">
              We use strictly necessary cookies so the site works. Optional cookies help us
              measure and improve the product. You can change your mind any time from the
              footer &ldquo;Cookie settings&rdquo; link.{" "}
              <Link href="/privacy" className="text-[#0072ce] underline">{t("pages.cookieConsent.privacy")}</Link>
              .
            </p>
          </div>
        </div>

        {expanded ? (
          <fieldset className="mt-4 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <legend className="sr-only">{t("pages.cookieConsent.categories")}</legend>
            <Category
              name="Strictly necessary"
              description="Keeps you signed in, remembers preferences, prevents CSRF. Always on — required for the site to function."
              checked
              disabled
              onChange={() => {}}
            />
            <Category
              name="Analytics"
              description="Aggregated product usage and performance data. Helps us fix bugs and prioritize improvements. Does not include advertising tracking."
              checked={analytics}
              onChange={setAnalytics}
            />
            <Category
              name="Marketing"
              description="Measures the effectiveness of marketing and remembers your preferences across visits. Off unless you enable it."
              checked={marketing}
              onChange={setMarketing}
            />
          </fieldset>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={acceptAll}
            className="flex-1 rounded-lg bg-[#0072ce] px-3 py-2 text-xs font-semibold text-white hover:bg-[#005ca8]"
          >{t("pages.cookieConsent.acceptAll")}</button>
          <button
            type="button"
            onClick={rejectAll}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >{t("pages.cookieConsent.essentialOnly")}</button>
          {expanded ? (
            <button
              type="button"
              onClick={() => save({ analytics, marketing })}
              className="flex-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >{t("pages.cookieConsent.saveChoices")}</button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
            >{t("pages.cookieConsent.customize")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Category({
  name,
  description,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 ${
        disabled ? "cursor-not-allowed opacity-70" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#0072ce]"
      />
      <span className="text-[11px] leading-relaxed text-slate-700">
        <span className="block font-semibold text-slate-900">{name}</span>
        <span className="block text-slate-500">{description}</span>
      </span>
    </label>
  );
}

/**
 * Footer link that lets the user re-open the banner. Drop this wherever
 * "Cookie settings" should appear in the site chrome.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  const { t } = useTranslation("dashboard");
  const { reopen, ready } = useCookieConsent();
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={reopen}
      className={
        className ?? "text-xs font-medium text-slate-600 hover:text-[#0072ce] hover:underline"
      }
    >{t("pages.cookieConsent.settings")}</button>
  );
}

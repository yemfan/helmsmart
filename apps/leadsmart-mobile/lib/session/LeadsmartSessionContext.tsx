import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMobileLeads } from "../leadsmartMobileApi";
import { signInWithApple, signInWithGoogle } from "../oauthMobile";
import { getSupabaseAuthClient } from "../supabaseAuthClient";
import { readOnboardingComplete, writeOnboardingComplete } from "./onboardingFlag";
import { consumeShouldClearSessionOnLaunch, setClearSessionOnNextLaunch } from "./rememberDevice";
import { clearStoredAccessToken, readStoredAccessToken, writeStoredAccessToken } from "./secureToken";
import { clearCachedAccessToken, setCachedAccessToken } from "./tokenCache";

type LeadsmartSessionValue = {
  ready: boolean;
  accessToken: string | null;
  onboardingComplete: boolean;
  /** Email + password against the same Supabase project as LeadSmart AI web (preferred). */
  signInWithEmailPassword: (email: string, password: string, rememberDevice?: boolean) => Promise<void>;
  /** Persist JWT after validating against the mobile API (fallback / dev). */
  signInWithToken: (token: string, rememberDevice?: boolean) => Promise<void>;
  signInWithGoogleOAuth: (rememberDevice?: boolean) => Promise<void>;
  signInWithAppleOAuth: (rememberDevice?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
};

const LeadsmartSessionContext = createContext<LeadsmartSessionValue | null>(null);

export function LeadsmartSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseAuthClient();

    const {
      data: { subscription },
    } =
      supabase?.auth.onAuthStateChange((event, sess) => {
        if (cancelled) return;
        void (async () => {
          if (event === "SIGNED_OUT") {
            clearCachedAccessToken();
            await clearStoredAccessToken();
            setAccessToken(null);
            return;
          }
          if (sess?.access_token) {
            setCachedAccessToken(sess.access_token);
            await writeStoredAccessToken(sess.access_token);
            setAccessToken(sess.access_token);
          }
        })();
      }) ?? { data: { subscription: { unsubscribe: () => {} } } };

    void (async () => {
      try {
        const onboarded = await readOnboardingComplete();
        if (cancelled) return;
        setOnboardingComplete(onboarded);

        if (supabase) {
          if (await consumeShouldClearSessionOnLaunch()) {
            await supabase.auth.signOut();
          }

          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (cancelled) return;

          if (session?.access_token) {
            setCachedAccessToken(session.access_token);
            await writeStoredAccessToken(session.access_token);
            setAccessToken(session.access_token);
          } else {
            const legacy = (await readStoredAccessToken())?.trim() ?? "";
            if (legacy) {
              setCachedAccessToken(legacy);
              setAccessToken(legacy);
            } else {
              clearCachedAccessToken();
              setAccessToken(null);
            }
          }
        } else {
          const legacy = (await readStoredAccessToken())?.trim() ?? "";
          if (legacy) {
            setCachedAccessToken(legacy);
            setAccessToken(legacy);
          } else {
            clearCachedAccessToken();
            setAccessToken(null);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const finalizeSupabaseSession = useCallback(async (supabase: SupabaseClient, rememberDevice: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const t = session?.access_token?.trim() ?? "";
    if (!t) throw new Error("No session after sign-in.");

    setCachedAccessToken(t);
    const res = await fetchMobileLeads({ page: 1, pageSize: 1 });
    if (res.ok === false) {
      clearCachedAccessToken();
      await supabase.auth.signOut();
      throw new Error(res.message);
    }

    await setClearSessionOnNextLaunch(!rememberDevice);
    await writeStoredAccessToken(t);
    setAccessToken(t);
  }, []);

  const signInWithEmailPassword = useCallback(
    async (email: string, password: string, rememberDevice = true) => {
      const supabase = getSupabaseAuthClient();
      if (!supabase) {
        throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await finalizeSupabaseSession(supabase, rememberDevice);
    },
    [finalizeSupabaseSession]
  );

  const signInWithToken = useCallback(
    async (token: string, rememberDevice = true) => {
      const t = token.trim();
      if (!t) {
        throw new Error("Paste your access token from RealtorBoss web, or sign in with email and password.");
      }

      setCachedAccessToken(t);
      const res = await fetchMobileLeads({ page: 1, pageSize: 1 });
      if (res.ok === false) {
        clearCachedAccessToken();
        throw new Error(res.message);
      }

      await setClearSessionOnNextLaunch(!rememberDevice);
      await writeStoredAccessToken(t);
      setAccessToken(t);
    },
    []
  );

  const signInWithGoogleOAuth = useCallback(
    async (rememberDevice = true) => {
      const supabase = getSupabaseAuthClient();
      if (!supabase) {
        throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      }
      await signInWithGoogle(supabase);
      await finalizeSupabaseSession(supabase, rememberDevice);
    },
    [finalizeSupabaseSession]
  );

  const signInWithAppleOAuth = useCallback(
    async (rememberDevice = true) => {
      const supabase = getSupabaseAuthClient();
      if (!supabase) {
        throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      }
      await signInWithApple(supabase);
      await finalizeSupabaseSession(supabase, rememberDevice);
    },
    [finalizeSupabaseSession]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseAuthClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    await setClearSessionOnNextLaunch(false);
    clearCachedAccessToken();
    await clearStoredAccessToken();
    setAccessToken(null);
  }, []);

  const markOnboardingComplete = useCallback(async () => {
    await writeOnboardingComplete(true);
    setOnboardingComplete(true);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      accessToken,
      onboardingComplete,
      signInWithEmailPassword,
      signInWithToken,
      signInWithGoogleOAuth,
      signInWithAppleOAuth,
      signOut,
      markOnboardingComplete,
    }),
    [
      ready,
      accessToken,
      onboardingComplete,
      signInWithEmailPassword,
      signInWithToken,
      signInWithGoogleOAuth,
      signInWithAppleOAuth,
      signOut,
      markOnboardingComplete,
    ]
  );

  return <LeadsmartSessionContext.Provider value={value}>{children}</LeadsmartSessionContext.Provider>;
}

export function useLeadsmartSession(): LeadsmartSessionValue {
  const ctx = useContext(LeadsmartSessionContext);
  if (!ctx) {
    throw new Error("useLeadsmartSession must be used within LeadsmartSessionProvider");
  }
  return ctx;
}

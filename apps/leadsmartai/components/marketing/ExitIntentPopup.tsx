"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trackLandingEvent } from "@/lib/marketing/landingTrack";

const SESSION_KEY = "leadsmart_exit_popup_session_done";
const MOBILE_DELAY_MS = 38_000;

function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

type Props = {
  role?: string;
};

export default function ExitIntentPopup({ role }: Props) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const shownRef = useRef(false);
  const mobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const exitIntentAllowedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      exitIntentAllowedRef.current = true;
    }, 4500);
    return () => clearTimeout(t);
  }, []);

  const tryShow = useCallback(
    (source: "exit_intent" | "mobile_timer") => {
      if (shownRef.current) return;
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
      } catch {
        /* ignore */
      }
      shownRef.current = true;
      setOpen(true);
      trackLandingEvent("landing_exit_intent_open", { source, role: role ?? "agent" });
    },
    [role]
  );

  useEffect(() => {
    const onMouseLeave = (e: MouseEvent) => {
      if (!exitIntentAllowedRef.current) return;
      if (e.clientY > 0) return;
      tryShow("exit_intent");
    };
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    return () => document.documentElement.removeEventListener("mouseleave", onMouseLeave);
  }, [tryShow]);

  useEffect(() => {
    if (!isCoarsePointer()) return;
    mobileTimerRef.current = setTimeout(() => {
      tryShow("mobile_timer");
    }, MOBILE_DELAY_MS);
    return () => {
      if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current);
    };
  }, [tryShow]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    trackLandingEvent("landing_exit_intent_dismiss", { role: role ?? "agent" });
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setErrorMsg("");
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg("Enter your email.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/marketing/exit-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          page_path: typeof window !== "undefined" ? window.location.pathname : "/",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setStatus("success");
      trackLandingEvent("landing_exit_intent_submit", { role: role ?? "agent" });
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setTimeout(() => setOpen(false), 2200);
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Try again.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="exit-popup-title">
      <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" aria-label={t("pages.exitIntent.close")} onClick={dismiss} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={t("pages.exitIntent.closeDialog")}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="border-b border-slate-100 bg-gradient-to-br from-sky-50 to-white px-6 pb-5 pt-8 sm:px-8">
          <p id="exit-popup-title" className="font-heading text-2xl font-bold text-slate-900">
            Before you go…
          </p>
          <p className="mt-3 text-lg font-semibold text-[#0072ce]">{t("pages.exitIntent.headline")}</p>
          <p className="mt-2 text-sm text-slate-600">{t("pages.exitIntent.sub")}</p>
        </div>
        <div className="px-6 py-6 sm:px-8">
          {status === "success" ? (
            <p className="text-center text-base font-semibold text-emerald-700">{t("pages.exitIntent.done")}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="sr-only">{t("pages.exitIntent.email")}</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="Enter your email →"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0072ce] focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              <input
                ref={honeypotRef}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
                aria-hidden
              />
              {errorMsg ? <p className="text-sm font-medium text-red-600">{errorMsg}</p> : null}
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-xl bg-[#0072ce] px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#005ca8] disabled:opacity-70"
              >
                {status === "loading" ? "Sending…" : "Send me the leads"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

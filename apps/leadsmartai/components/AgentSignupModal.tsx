"use client";

import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { AgentSignupForm } from "@/components/agent-signup/AgentSignupForm";
import type { SignupOverlayPrefill } from "@/lib/hooks/useSignupProfilePrefill";

/**
 * Modeless-style panel: page behind stays interactive (`pointer-events-none` on shell).
 * Close with X or Escape — same interaction pattern as {@link AuthModal}.
 */
export default function AgentSignupModal({
  open,
  onClose,
  overlayPrefill,
}: {
  open: boolean;
  onClose: () => void;
  overlayPrefill?: SignupOverlayPrefill | null;
}) {
  const { t } = useTranslation("dashboard");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <div
        className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="false"
        aria-labelledby="agent-signup-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label={t("pages.misc.close")}
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>

        <div className="max-h-[min(85vh,720px)] overflow-y-auto px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-slate-500">{t("pages.agentSignupModal.loadingForm")}</div>
            }
          >
            <span id="agent-signup-modal-title" className="sr-only">{t("pages.misc.createAgentAccount")}</span>
            <AgentSignupForm
              layout="dialog"
              overlayPrefill={overlayPrefill ?? null}
              onClose={onClose}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

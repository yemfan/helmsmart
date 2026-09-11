"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { acceptInvitation } from "@/lib/actions/team";

export function AcceptButton({ token, orgName }: { token: string; orgName: string }) {
  const { t } = useTranslation("public");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone]   = useState(false);

  function handleAccept() {
    setError("");
    start(async () => {
      try {
        // A refusal comes back as a value, already in the reader's language.
        const res = await acceptInvitation(token);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDone(true);
        // Set org cookie then redirect to home
        document.cookie = `helmsmart-org-id=${res.orgId}; path=/; max-age=${60 * 60 * 24 * 365}`;
        setTimeout(() => router.push("/home"), 1500);
      } catch {
        // The request itself failed (network, deploy mid-flight).
        setError(t("join.accept.error"));
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        <p className="text-sm font-medium text-slate-700">{t("join.accept.done")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAccept}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors"
      >
        {pending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {t("join.accept.joining")}</>
        ) : (
          t("join.accept.button", { org: orgName })
        )}
      </button>
      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-2 text-center" role="alert">{error}</p>
      )}
    </div>
  );
}

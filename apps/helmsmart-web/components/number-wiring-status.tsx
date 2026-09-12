"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rebindNumber, verifyNumberWiring } from "@/lib/actions/voice-setup";
import { describeWiring, type WiringResult } from "@/lib/voice/number-wiring";

/**
 * Whether calls to this number are actually answered — said the same way
 * everywhere it is said.
 *
 * Three screens used to claim readiness from three different facts. The
 * receptionist checklist ticked its boxes off our own database, the Voice AI
 * card turned emerald as soon as a number existed in a column, and the /voice
 * header only ever mentioned the on/off switch. None of them asked the
 * provider, so an org whose number Retell had never heard of read "Ready",
 * "Connected" and silence — over a line that would not have picked up a single
 * call.
 *
 * This component asks, and every one of those screens renders it.
 */

type Props = {
  /** The number as stored. Shown in the sentence so the owner knows which line. */
  number: string;
  /**
   * `full` — the whole verdict, including a green line when all is well.
   * `problems` — render nothing unless something is wrong. For dashboards,
   * where "your receptionist is fine" is not news but "it isn't answering" is.
   */
  variant?: "full" | "problems";
  /** Where the manual wiring instructions live, for a number we cannot repair. */
  manualHref?: string;
  /** Lets a parent keep its own badge honest without checking twice. */
  onResult?: (result: WiringResult | null) => void;
};

export function NumberWiringStatus({ number, variant = "full", manualHref, onResult }: Props) {
  const { t } = useTranslation("voice");
  const [result, setResult] = useState<WiringResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [repairing, startRepair] = useTransition();
  const [repairError, setRepairError] = useState<string | null>(null);

  const check = useCallback(() => {
    startCheck(async () => {
      const r = await verifyNumberWiring();
      setResult(r);
      onResult?.(r);
    });
    // `onResult` is a parent callback; re-running the check when its identity
    // changes would loop the provider once per parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    check();
  }, [check, number]);

  function handleRepair() {
    setRepairError(null);
    startRepair(async () => {
      const res = await rebindNumber();
      if (!res.ok) {
        setRepairError(res.error ?? t("wiring.reconnectFailed"));
        return;
      }
      // Never assert the repair worked — ask again and show what comes back.
      check();
    });
  }

  const verdict = describeWiring(result);
  const busy = checking && result === null;

  if (variant === "problems" && (busy || verdict.state !== "unwired")) return null;

  if (busy) {
    return (
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("wiring.checking")}
      </p>
    );
  }

  if (verdict.state === "wired") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("wiring.wired", { number })}
        </p>
        <CheckAgain checking={checking} onClick={check} label={t("wiring.checkAgain")} />
      </div>
    );
  }

  if (verdict.state === "unknown") {
    // We could not ask. That is not a pass and not a failure of the number —
    // say which, and let them try again.
    return (
      <div className="space-y-1">
        <p className="text-sm text-slate-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
          {t(verdict.headlineKey, { number })}
        </p>
        {verdict.errorText ? <p className="text-xs text-slate-500">{verdict.errorText}</p> : null}
        <CheckAgain checking={checking} onClick={check} label={t("wiring.checkAgain")} />
      </div>
    );
  }

  // Unwired: name the failing check, then offer the fix that matches it.
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 space-y-1.5">
      <p className="text-sm font-medium text-amber-800 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        {t("wiring.notConnected", { number })}
      </p>
      <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
        {verdict.reasonKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        {verdict.canRebind ? (
          <button
            type="button"
            onClick={handleRepair}
            disabled={repairing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 hover:border-amber-300 disabled:opacity-50 text-xs font-medium text-amber-900 rounded-lg transition-colors"
          >
            {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {repairing ? t("wiring.reconnecting") : t("wiring.reconnect")}
          </button>
        ) : (
          <p className="text-xs text-amber-700">
            {t("wiring.manualFix")}{" "}
            {manualHref ? (
              <a href={manualHref} className="font-medium underline">
                {t("wiring.manualFixLink")}
              </a>
            ) : null}
          </p>
        )}
        <CheckAgain checking={checking} onClick={check} label={t("wiring.checkAgain")} amber />
      </div>

      {repairError ? (
        <p className="text-xs text-rose-600" role="alert">
          {repairError}
        </p>
      ) : null}
    </div>
  );
}

function CheckAgain({
  checking,
  onClick,
  label,
  amber = false,
}: {
  checking: boolean;
  onClick: () => void;
  label: string;
  amber?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={checking}
      className={`text-xs underline disabled:opacity-50 ${amber ? "text-amber-700 hover:text-amber-900" : "text-slate-500 hover:text-slate-700"}`}
    >
      {checking ? <Loader2 className="w-3 h-3 animate-spin inline" /> : label}
    </button>
  );
}

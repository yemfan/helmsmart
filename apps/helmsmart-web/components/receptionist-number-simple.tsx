"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveTwilioNumber } from "@/lib/actions/messages";
import { verifyNumberWiring } from "@/lib/actions/voice-setup";
import { describeWiring, type WiringResult } from "@/lib/voice/number-wiring";

/**
 * Record a number that already reaches us. The escape hatch, not the front door.
 *
 * This is one of the four paths in `receptionist-number-setup.tsx`, and the
 * only one that wires nothing: it exists for accounts that share a line which
 * is already pointed at the platform. Owners setting up for the first time
 * want the paths above it — get a number from HelmSmart, forward their existing
 * line to it at their carrier, or import a Twilio number they own.
 *
 * (This used to be the ONLY number UI on the screen, which is what made the
 * defect: the buy/import code existed but was imported nowhere.)
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, AND WHY IT SAYS SO. Saving a number only
 * writes `organizations.twilio_number`. It does NOT attach the number to the
 * Retell agent or point the inbound webhook at us — the wizard did that as a
 * side effect of buying or importing. So a saved number alone will not make the
 * agent answer, and reporting "saved" would be the same silent success that hid
 * this whole class of bug: a setting that looks applied over a feature that
 * cannot work.
 *
 * So every save is followed by `verifyNumberWiring()`, and the result is shown
 * plainly, naming which of the three checks failed — through `describeWiring`,
 * the same mapping the receptionist checklist and the Voice AI card use, so the
 * three screens cannot drift back into three different verdicts.
 */

export function ReceptionistNumberSimple({
  current,
  frameless = false,
}: {
  current: string | null;
  /** Drop the card chrome when this is nested inside another panel. */
  frameless?: boolean;
}) {
  const { t } = useTranslation("voice");
  const router = useRouter();
  const [number, setNumber] = useState(current ?? "");
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wiring, setWiring] = useState<WiringResult | null>(null);

  function handleSave() {
    setError(null);
    setWiring(null);
    start(async () => {
      const saved = await saveTwilioNumber(number);
      if (!saved.ok) {
        setError(saved.error ?? t("number.saveFailed"));
        return;
      }
      if (saved.value !== undefined) setNumber(saved.value); // normalised E.164

      // Saved is not the same as working. Say which.
      setWiring(await verifyNumberWiring());
      router.refresh();
    });
  }

  return (
    <div className={frameless ? "" : "border border-slate-200 rounded-lg p-4 mb-5"}>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {t("number.label")}
      </label>
      <p className="text-xs text-slate-500 mb-2">
        {t("number.help")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          The placeholder is a reserved 555 number, not a plausible one.

          It used to read "+1 626 888 7170", which is worse than a real-looking
          invention: that IS a real number — CloseBoss's registered SMS sender,
          in a different Twilio account. A placeholder indistinguishable from
          production config wastes everyone's time in both directions. It was
          read as an example when it was real, and (by me) dismissed as an
          example when someone correctly named it as the working sender.

          A placeholder should be unmistakably an example.
        */}
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+1 555 010 0000"
          inputMode="tel"
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          {isPending ? t("number.saving") : t("number.save")}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-rose-600 mt-2" role="alert">
          {error}
        </p>
      ) : null}

      {wiring ? <SaveVerdict wiring={wiring} /> : null}
    </div>
  );
}

/**
 * What the check found, straight after the save.
 *
 * "Saved" and "working" are different claims, and only the second one matters
 * to a caller. The verdict comes from `describeWiring` so this says the same
 * thing the receptionist checklist and the Voice AI card say about the same
 * number.
 */
function SaveVerdict({ wiring }: { wiring: WiringResult }) {
  const { t } = useTranslation("voice");
  const verdict = describeWiring(wiring);

  if (verdict.state === "wired") {
    return (
      <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t("number.wiredOk")}
      </p>
    );
  }

  if (verdict.state === "unknown") {
    return (
      <div className="mt-2">
        <p className="text-xs text-slate-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
          <span>{t("number.savedNotChecked")}</span>
        </p>
        {verdict.errorText ? <p className="text-xs text-slate-500 mt-0.5 pl-5">{verdict.errorText}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
      <p className="text-xs font-medium text-amber-800 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        {t("number.savedNotAnswering")}
      </p>
      {/* Name the failing check — "it doesn't work" is not actionable. */}
      <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
        {verdict.reasonKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </div>
  );
}

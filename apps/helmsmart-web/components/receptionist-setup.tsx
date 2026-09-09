"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Copy, Check, PhoneCall, ShieldCheck, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReceptionistNumberSimple } from "@/components/receptionist-number-simple";
import { verifyNumberWiring } from "@/lib/actions/voice-setup";

export type SetupStatus = {
  numberOk: boolean;
  number: string | null;
  hoursOk: boolean;
  typesOk: boolean;
  typesCount: number;
  agentEnabled: boolean;
  googleConfigured: boolean;
  googleConnected: boolean;
  inboundUrl: string;
  functionUrl: string;
};

function CopyField({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-stretch gap-1.5">
        <code className="flex-1 text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 text-indigo-700 font-mono break-all">
          {value}
        </code>
        <button
          type="button"
          aria-label={copyLabel}
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 px-2 rounded border border-slate-200 bg-white text-xs text-slate-500 hover:text-slate-700 hover:border-slate-300"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Item({ ok, label, fix }: { ok: boolean; label: string; fix: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className={`text-sm ${ok ? "text-slate-700" : "text-slate-800 font-medium"}`}>{label}</p>
        {!ok && <p className="text-xs text-slate-500 mt-0.5">{fix}</p>}
      </div>
    </li>
  );
}

export function ReceptionistSetup({ status }: { status: SetupStatus }) {
  const { t } = useTranslation("voice");
  /**
   * Everything the APP controls. Necessary for the agent to work, and nowhere
   * near sufficient: the number also has to exist in Retell, bound to our agent
   * with the inbound webhook pointed here. None of that is visible from our own
   * database.
   */
  const appReady = status.numberOk && status.hoursOk && status.typesOk && status.agentEnabled;

  const [verifying, startVerify] = useTransition();
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * "Ready" means a caller gets answered, and only the provider can confirm
   * that. This badge read Ready off app state alone, so it sat green while
   * Retell had never heard of the number — the agent would not have picked up a
   * single call. Unverified is not the same as working, so it does not claim to
   * be.
   */
  const badge = !appReady
    ? { text: t("setup.badge.needsSetup"), cls: "text-amber-700 bg-amber-50" }
    : verifyMsg === null
      ? { text: t("setup.badge.notVerified"), cls: "text-slate-600 bg-slate-100" }
      : verifyMsg.ok
        ? { text: t("setup.badge.ready"), cls: "text-emerald-700 bg-emerald-50" }
        : { text: t("setup.badge.notAnswering"), cls: "text-rose-700 bg-rose-50" };

  // Check on load once the app-side boxes are ticked, so the badge is truthful
  // without waiting for someone to press a button they have no reason to press.
  useEffect(() => {
    if (appReady && verifyMsg === null) handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady]);

  function handleVerify() {
    setVerifyMsg(null);
    startVerify(async () => {
      const r = await verifyNumberWiring();
      if (r.ok) {
        setVerifyMsg({ ok: true, text: t("setup.verifyOk") });
      } else if (!r.numberFound) {
        setVerifyMsg({ ok: false, text: r.error ?? t("setup.verifyUnknownNumber") });
      } else {
        const missing = [
          !r.webhookOk && t("setup.missingWebhook"),
          !r.agentOk && t("setup.missingAgent"),
        ].filter(Boolean).join(" + ");
        setVerifyMsg({ ok: false, text: t("setup.verifyMissing", { missing }) });
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">{t("setup.title")}</h3>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
          {verifying && verifyMsg === null ? t("setup.badge.checking") : badge.text}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">{t("setup.description")}</p>

      {/*
        Enter the number you already own — the CloseBoss shape. The buy/import
        wizard is kept in the repo for when per-tenant numbers come back; see
        receptionist-number-simple.tsx for why it was set aside rather than
        deleted.
      */}
      {!status.numberOk && <ReceptionistNumberSimple current={status.number} />}

      {/* What the app controls */}
      <ul className="divide-y divide-slate-100 mb-5">
        <Item
          ok={status.numberOk}
          label={status.numberOk ? t("setup.items.numberOk", { number: status.number }) : t("setup.items.numberMissing")}
          fix={t("setup.items.numberFix")}
        />
        <Item
          ok={status.hoursOk}
          label={t("setup.items.hours")}
          fix={t("setup.items.hoursFix")}
        />
        <Item
          ok={status.typesOk}
          label={status.typesOk ? t("setup.items.typesOk", { count: status.typesCount }) : t("setup.items.typesMissing")}
          fix={t("setup.items.typesFix")}
        />
        <Item
          ok={status.agentEnabled}
          label={t("setup.items.agent")}
          fix={t("setup.items.agentFix")}
        />
        <Item
          ok={status.googleConnected}
          label={status.googleConnected ? t("setup.items.calendarOk") : t("setup.items.calendarOptional")}
          fix={status.googleConfigured ? t("setup.items.calendarFix") : t("setup.items.calendarFixUnconfigured")}
        />
      </ul>

      {status.numberOk ? (
        /* Connected → let them confirm the wiring is actually right in Retell */
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 text-sm text-slate-700 rounded-lg transition-colors"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-indigo-500" />}
              {verifying ? t("setup.verifying") : t("setup.verify")}
            </button>
            {verifyMsg && (
              <span className={`text-xs flex items-center gap-1.5 ${verifyMsg.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {verifyMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {verifyMsg.text}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">{t("setup.verifyHint")}</p>
        </div>
      ) : (
        /* No number → manual fallback for operators wiring Retell by hand */
        <details className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <summary className="text-xs font-semibold text-slate-600 uppercase tracking-wide cursor-pointer">{t("setup.manual.summary")}</summary>
          <ol className="text-xs text-slate-600 space-y-1.5 my-3 list-decimal list-inside">
            <li>{t("setup.manual.step1")}</li>
            <li>{t("setup.manual.step2")}</li>
            <li>{t("setup.manual.step3")}</li>
          </ol>
          <div className="space-y-2.5">
            <CopyField label={t("setup.manual.inboundLabel")} value={status.inboundUrl} copyLabel={t("setup.manual.copy")} />
            <CopyField label={t("setup.manual.functionLabel")} value={status.functionUrl} copyLabel={t("setup.manual.copy")} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {t("setup.manual.note")}
          </p>
        </details>
      )}
    </div>
  );
}

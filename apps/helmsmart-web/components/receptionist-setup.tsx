"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Copy, Check, PhoneCall } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NumberWiringStatus } from "@/components/number-wiring-status";
import { ReceptionistNumberSetup } from "@/components/receptionist-number-setup";
import { describeWiring, isReceptionistReady, type WiringResult } from "@/lib/voice/number-wiring";

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

export function ReceptionistSetup({ status, canManage = true }: { status: SetupStatus; canManage?: boolean }) {
  const { t } = useTranslation("voice");
  /**
   * Everything the APP controls. Necessary for the agent to work, and nowhere
   * near sufficient: the number also has to exist in Retell, bound to our agent
   * with the inbound webhook pointed here. None of that is visible from our own
   * database.
   */
  const appReady = status.numberOk && status.hoursOk && status.typesOk && status.agentEnabled;

  /**
   * The provider's answer, reported up by `NumberWiringStatus` so the badge and
   * the status line cannot disagree. `null` while the check is in flight.
   */
  const [wiring, setWiring] = useState<WiringResult | null>(null);

  /**
   * "Ready" means a caller gets answered, and only the provider can confirm
   * that. This badge read Ready off app state alone, so it sat green while
   * Retell had never heard of the number — the agent would not have picked up a
   * single call. Unverified is not the same as working, so it does not claim to
   * be.
   */
  const verdict = describeWiring(wiring);
  const badge = !appReady
    ? { text: t("setup.badge.needsSetup"), cls: "text-amber-700 bg-amber-50" }
    : isReceptionistReady(appReady, wiring)
      ? { text: t("setup.badge.ready"), cls: "text-emerald-700 bg-emerald-50" }
      : verdict.state === "unwired"
        ? { text: t("setup.badge.notAnswering"), cls: "text-rose-700 bg-rose-50" }
        : { text: t("setup.badge.notVerified"), cls: "text-slate-600 bg-slate-100" };

  return (
    <div id="receptionist-setup" className="bg-white border border-slate-200 rounded-xl p-6 mb-8 scroll-mt-6">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">{t("setup.title")}</h3>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">{t("setup.description")}</p>

      {/*
        Getting a number, and keeping it honest afterwards. Always mounted —
        this used to appear only when no number was set, so an owner with a
        wrong or unwired number had nowhere on the screen to change it.
      */}
      <ReceptionistNumberSetup
        current={status.number}
        canManage={canManage}
        manualHref="#receptionist-manual-wiring"
        onWiring={setWiring}
      />

      {/* What the app controls */}
      <ul className="divide-y divide-slate-100 mb-5">
        {/*
          A recorded number is not an answered one. This line used to tick green
          off `numberOk` alone — the same claim the badge used to make — so the
          checklist read "Phone number connected" over a number the provider had
          never heard of.
        */}
        <Item
          ok={status.numberOk && verdict.state === "wired"}
          label={
            !status.numberOk
              ? t("setup.items.numberMissing")
              : verdict.state === "wired"
                ? t("setup.items.numberOk", { number: status.number })
                : verdict.state === "unwired"
                  ? t("setup.items.numberNotAnswering", { number: status.number })
                  : t("setup.items.numberUnverified", { number: status.number })
          }
          fix={status.numberOk ? t("setup.items.numberWiringFix") : t("setup.items.numberFix")}
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

      {/*
        The by-hand fallback, now always available. It used to be hidden as soon
        as a number was recorded, which is exactly backwards: the org that needs
        these URLs is the one whose saved number the provider will not let us
        repair. `NumberWiringStatus` links here by this id.
      */}
      <details id="receptionist-manual-wiring" className="bg-slate-50 border border-slate-200 rounded-lg p-4">
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
    </div>
  );
}

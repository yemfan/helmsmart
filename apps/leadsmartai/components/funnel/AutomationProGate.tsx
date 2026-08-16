"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { emitLeadsmartUpgradePrompt } from "@/lib/funnel/emitUpgradePrompt";

/**
 * Soft banner when CRM automation isn’t on the user’s plan — doesn’t block the page.
 */
export function AutomationProGate() {
  const { t } = useTranslation("dashboard");
  const [show, setShow] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/funnel/state", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        gates?: { automation?: boolean };
      };
      if (res.ok && body.ok === true && body.gates?.automation === false) {
        setShow(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-semibold">{t("pages.proGate.automationPro")}</span>{t("pages.proGate.upgradeSub")}</p>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          onClick={() => emitLeadsmartUpgradePrompt("crm_automation_locked")}
        >{t("pages.proGate.seeOptions")}</button>
        <a
          href="/dashboard/billing"
          className="rounded-lg border border-amber-800/30 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100/80 text-center"
        >{t("pages.proGate.billing")}</a>
      </div>
    </div>
  );
}

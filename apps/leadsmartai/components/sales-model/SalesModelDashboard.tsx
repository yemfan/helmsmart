"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getSalesModel,
  type SalesModelId,
} from "@/lib/sales-models";
import {
  buildPipelineActivity,
  type ActivitySnapshot,
} from "@/lib/sales-model/pipelineActivity";
import { updateSelectedSalesModel } from "@/lib/sales-model-storage";
import { AiEmailModal } from "./AiEmailModal";
import { AiSmsModal } from "./AiSmsModal";
import { DailyActionPlan } from "./DailyActionPlan";
import { IdentityBlock } from "./IdentityBlock";
import { ModelToolsGrid } from "./ModelToolsGrid";
import { PipelineView } from "./PipelineView";
import { ScriptGenerator } from "./ScriptGenerator";
import { SwitchModelModal } from "./SwitchModelModal";

/**
 * Top-level client wrapper for the sales-model dashboard.
 *
 * The server page (`/dashboard/sales-model/page.tsx`) resolves the
 * selected model from Supabase and passes the id in. From there
 * everything is client-side — section components read from the model
 * config and render themselves.
 *
 * Switching models updates local state immediately (so the UI
 * rebrands without a round-trip), then persists via the storage
 * helper. If the persist fails the modal stays open with the error.
 */
export function SalesModelDashboard({
  initialModelId,
  activitySnapshot,
}: {
  initialModelId: SalesModelId;
  /** Pre-fetched on the server. The activity snapshot is the same
   *  across model switches — selecting a different sales model just
   *  remaps the same numbers to different stage labels. */
  activitySnapshot: ActivitySnapshot;
}) {
  const { t } = useTranslation("dashboard");
  const [modelId, setModelId] = useState<SalesModelId>(initialModelId);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const model = getSalesModel(modelId);
  const pipelineActivity = buildPipelineActivity(model, activitySnapshot);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("pages.salesModelDashboard.title")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {model.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {model.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setSmsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <SmsIcon />{t("pages.salesModelDashboard.launchSms")}</button>
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
          >
            <EmailIcon />{t("pages.salesModelDashboard.launchEmail")}</button>
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >{t("pages.salesModelDashboard.switchModel")}</button>
        </div>
      </div>

      <IdentityBlock model={model} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyActionPlan model={model} />
        <PipelineView model={model} activity={pipelineActivity} />
      </div>

      <ModelToolsGrid model={model} />

      <ScriptGenerator model={model} />

      <SwitchModelModal
        open={switchOpen}
        currentModel={modelId}
        onClose={() => setSwitchOpen(false)}
        onConfirm={async (next) => {
          // Optimistic UI: rebrand the dashboard the moment the user
          // confirms. Persist in the background; if the server save
          // fails we surface the error in the modal and the local
          // state stays as-is so the agent isn't locked out of the
          // new model. Worst case they re-confirm.
          setModelId(next);
          const saved = await updateSelectedSalesModel(undefined, next);
          return saved
            ? { ok: true }
            : { ok: false, error: "Saved locally, but could not sync to your account." };
        }}
      />

      <AiSmsModal
        open={smsOpen}
        model={model}
        onClose={() => setSmsOpen(false)}
      />

      <AiEmailModal
        open={emailOpen}
        model={model}
        onClose={() => setEmailOpen(false)}
      />
    </div>
  );
}

function SmsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
      <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createApprovalWorkflow, updateApprovalWorkflow, deleteApprovalWorkflow } from "@/lib/actions/approval-chains";

/** Trigger values are stored in `approval_workflows.trigger_type`; labels come from the bundle. */
const TRIGGER_TYPES = ["manual", "estimate_over_amount", "expense_over_amount", "custom"] as const;

/** Approver roles as stored; "" means any admin or owner. */
const ROLE_OPTIONS = [
  { value: "", key: "any" },
  { value: "owner", key: "owner" },
  { value: "admin", key: "admin" },
  { value: "bookkeeper", key: "bookkeeper" },
] as const;

interface StepInput {
  step_name: string;
  approver_role: string;
  timeout_hours: string;
}

interface Props {
  workflowId?: string;
  initialValues?: {
    name: string;
    description: string;
    triggerType: string;
    amountThreshold: string;
    isActive: boolean;
    steps: StepInput[];
  };
}

export function WorkflowEditor({ workflowId, initialValues }: Props) {
  const { t } = useTranslation("workflows");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [triggerType, setTriggerType] = useState(initialValues?.triggerType ?? "manual");
  const [amountThreshold, setAmountThreshold] = useState(initialValues?.amountThreshold ?? "");
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [steps, setSteps] = useState<StepInput[]>(
    initialValues?.steps ?? [{ step_name: t("editor.firstStepName"), approver_role: "admin", timeout_hours: "" }]
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { step_name: t("editor.nextStepName", { number: prev.length + 1 }), approver_role: "admin", timeout_hours: "" },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updates: Partial<StepInput>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const needsAmount = triggerType === "estimate_over_amount" || triggerType === "expense_over_amount";

  const handleSave = () => {
    if (!name.trim()) { setError(t("editor.errors.nameRequired")); return; }
    if (steps.length === 0) { setError(t("editor.errors.stepRequired")); return; }
    if (needsAmount && !amountThreshold) { setError(t("editor.errors.amountRequired")); return; }
    setError(null);
    setSaved(false);

    const triggerConfig = needsAmount ? { amount_threshold: Number(amountThreshold) } : {};

    startTransition(async () => {
      const mappedSteps = steps.map((s, i) => ({
        step_order: i + 1,
        step_name: s.step_name,
        approver_role: s.approver_role || undefined,
        timeout_hours: s.timeout_hours ? Number(s.timeout_hours) : undefined,
      }));

      if (workflowId) {
        const result = await updateApprovalWorkflow(workflowId, {
          name: name.trim(),
          description: description.trim(),
          isActive,
          steps: mappedSteps,
        });
        if (!result.ok) { setError(result.error ?? t("editor.errors.saveFailed")); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const result = await createApprovalWorkflow({
          name: name.trim(),
          description: description.trim(),
          triggerType,
          triggerConfig,
          steps: mappedSteps,
        });
        if (!result.ok) { setError(result.error ?? t("editor.errors.createFailed")); return; }
        router.push(`/workflows/${result.workflowId}`);
      }
    });
  };

  const handleDelete = () => {
    if (!workflowId || !confirm(t("editor.deleteConfirm"))) return;
    startTransition(async () => {
      await deleteApprovalWorkflow(workflowId);
      router.push("/workflows");
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/workflows" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 flex-1">
          {workflowId ? t("editor.editTitle") : t("editor.newTitle")}
        </h1>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> {t("editor.saved")}</> : isPending ? t("editor.saving") : t("editor.save")}
        </button>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{t("editor.detailsTitle")}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t("editor.nameLabel")} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                placeholder={t("editor.namePlaceholder")}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("editor.descriptionLabel")}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
                placeholder={t("editor.descriptionPlaceholder")}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Trigger */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{t("editor.triggerTitle")}</h2>
          <div className="space-y-2">
            {TRIGGER_TYPES.map((value) => (
              <label key={value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${triggerType === value ? "bg-indigo-50 border-indigo-200" : "border-slate-100 hover:bg-slate-50"}`}>
                <input
                  type="radio"
                  name="trigger"
                  value={value}
                  checked={triggerType === value}
                  onChange={() => setTriggerType(value)}
                  disabled={!!workflowId || isPending}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{t(`editor.triggerTypes.${value}.label`)}</p>
                  <p className="text-xs text-slate-500">{t(`editor.triggerTypes.${value}.description`)}</p>
                </div>
              </label>
            ))}
          </div>
          {needsAmount && (
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t("editor.amountLabel")} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={amountThreshold}
                onChange={(e) => setAmountThreshold(e.target.value)}
                disabled={!!workflowId || isPending}
                placeholder={t("editor.amountPlaceholder")}
                min="0"
                className="w-40 text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>
          )}
        </div>

        {/* Approval steps */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">{t("editor.stepsTitle")}</h2>
            <button
              type="button"
              onClick={addStep}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("editor.addStep")}
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-3 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                  {index + 1}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t("editor.stepNameLabel")}</label>
                    <input
                      type="text"
                      value={step.step_name}
                      onChange={(e) => updateStep(index, { step_name: e.target.value })}
                      disabled={isPending}
                      placeholder={t("editor.stepNamePlaceholder")}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t("editor.approverRoleLabel")}</label>
                    <select
                      value={step.approver_role}
                      onChange={(e) => updateStep(index, { approver_role: e.target.value })}
                      disabled={isPending}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:opacity-60"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{t(`editor.roles.${r.key}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t("editor.timeoutLabel")}</label>
                    <input
                      type="number"
                      value={step.timeout_hours}
                      onChange={(e) => updateStep(index, { timeout_hours: e.target.value })}
                      disabled={isPending}
                      placeholder={t("editor.timeoutPlaceholder")}
                      min="1"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:opacity-60"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  disabled={isPending || steps.length <= 1}
                  className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-30 flex-shrink-0 self-start mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        {workflowId && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isPending}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">{t("editor.activeTitle")}</p>
                <p className="text-xs text-slate-500">{t("editor.activeHint")}</p>
              </div>
            </label>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {workflowId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium disabled:opacity-50"
          >
            {t("editor.deleteWorkflow")}
          </button>
        )}
      </div>
    </div>
  );
}

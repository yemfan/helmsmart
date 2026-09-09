"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Play, Pause, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  toggleAutomationRule,
  deleteAutomationRule,
  type AutomationRule,
} from "@/lib/actions/automations";
import { AddAutomationModal } from "@/components/add-automation-modal";

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Badge colour per trigger / action. Labels live in the bundle, keyed by the same enum. */
const TRIGGER_COLORS: Record<string, string> = {
  invoice_overdue: "bg-rose-100 text-rose-700",
  invoice_paid:    "bg-emerald-100 text-emerald-700",
  new_lead:        "bg-blue-100 text-blue-700",
  campaign_sent:   "bg-indigo-100 text-indigo-700",
};

const ACTION_COLORS: Record<string, string> = {
  create_task: "bg-amber-100 text-amber-700",
  send_email:  "bg-sky-100 text-sky-700",
  add_note:    "bg-slate-100 text-slate-600",
};

/** Template variables an automation config may use. The token is data; only the description is copy. */
const TEMPLATE_VARS = ["client_name", "invoice_number", "amount", "campaign_name"] as const;

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: Translate) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("automations.time.justNow");
  if (m < 60) return t("automations.time.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("automations.time.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return t("automations.time.daysAgo", { count: d });
}

// ─── Rule row ─────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onDelete,
}: {
  rule: AutomationRule;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("workflows");
  const [enabled, setEnabled] = useState(rule.enabled);
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  const triggerLabel = t(`automations.triggerLabels.${rule.trigger}`, { defaultValue: rule.trigger });
  const triggerColor = TRIGGER_COLORS[rule.trigger] ?? "bg-slate-100 text-slate-500";
  const actionLabel = t(`automations.actionLabels.${rule.action}`, { defaultValue: rule.action });
  const actionColor = ACTION_COLORS[rule.action] ?? "bg-slate-100 text-slate-500";

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startToggle(async () => {
      try {
        await toggleAutomationRule(rule.id, next);
      } catch {
        setEnabled(!next); // roll back
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("automations.deleteConfirm", { name: rule.name }))) return;
    onDelete(rule.id);
    startDelete(async () => {
      try {
        await deleteAutomationRule(rule.id);
      } catch (err) {
        console.error(err);
      }
    });
  }

  return (
    <div className={`flex items-center gap-4 px-5 py-4 group transition-colors hover:bg-slate-50 ${deleting ? "opacity-40 pointer-events-none" : ""}`}>
      {/* Toggle */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        title={enabled ? t("automations.disable") : t("automations.enable")}
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          enabled
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "bg-slate-200 text-slate-400 hover:bg-slate-300"
        }`}
      >
        {enabled ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${enabled ? "text-slate-800" : "text-slate-400"}`}>
          {rule.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${triggerColor}`}>
            {triggerLabel}
          </span>
          <span className="text-slate-300 text-xs">→</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${actionColor}`}>
            {actionLabel}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 text-right hidden sm:block">
        <p className="text-xs font-medium text-slate-700 tabular-nums">
          {t("automations.runs", { count: rule.run_count })}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {rule.last_run_at ? timeAgo(rule.last_run_at, t) : t("automations.neverRun")}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={t("common:actions.delete")}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 transition-all rounded-lg"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AutomationsList({ initialRules }: { initialRules: AutomationRule[] }) {
  const { t } = useTranslation("workflows");
  const [rules, setRules] = useState(initialRules);
  const [modalOpen, setModalOpen] = useState(false);

  function handleCreated(rule: AutomationRule) {
    setRules((prev) => [rule, ...prev]);
    setModalOpen(false);
  }

  function handleDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      {/* Empty state or list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("automations.rules")}
            {rules.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">{rules.length}</span>
            )}
          </h2>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("automations.newAutomation")}
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{t("automations.emptyTitle")}</p>
            <p className="text-xs text-slate-400 mb-5 max-w-sm mx-auto">
              {t("automations.emptyBody")}
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("automations.createFirst")}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Template variable reference */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t("automations.variables.title")}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {TEMPLATE_VARS.map((v) => (
            <div key={v} className="flex items-center gap-2">
              <code className="text-[11px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-indigo-600 font-mono">
                {`{{${v}}}`}
              </code>
              <span className="text-[11px] text-slate-400">{t(`automations.variables.${v}`)}</span>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <AddAutomationModal
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { X, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createAutomationRule,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationConfig,
  type AutomationRule,
} from "@/lib/actions/automations";

// ─── Option definitions ───────────────────────────────────────────────────────
//
// The values are what the automation engine stores and parses; the label and
// hint for each one live in the bundle under the same key.

const TRIGGERS: AutomationTrigger[] = ["invoice_overdue", "invoice_paid", "new_lead", "campaign_sent"];

const ACTIONS: AutomationAction[] = ["create_task", "send_email", "add_note"];

// Available template variables per trigger. These are tokens the engine
// substitutes at run time, not copy — they stay in source in every language.
const TRIGGER_VARS: Record<AutomationTrigger, string[]> = {
  invoice_overdue: ["{{client_name}}", "{{invoice_number}}", "{{amount}}"],
  invoice_paid:    ["{{client_name}}", "{{invoice_number}}", "{{amount}}"],
  new_lead:        ["{{client_name}}"],
  campaign_sent:   ["{{campaign_name}}"],
};

/**
 * Passed to `t()` for every default task/note body, so the `{{client_name}}`
 * style tokens survive interpolation instead of being blanked out by it.
 */
const KEEP_TOKENS = {
  client_name: "{{client_name}}",
  invoice_number: "{{invoice_number}}",
  amount: "{{amount}}",
  campaign_name: "{{campaign_name}}",
};

// The email an automation sends reaches the CLIENT, so its default subject and
// body stay in English here and follow the recipient's language at send time.
const DEFAULT_EMAIL_SUBJECT = "An update from us";
const DEFAULT_EMAIL_BODY = "Hi {{client_name}},\n\n";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: (rule: AutomationRule) => void;
}

export function AddAutomationModal({ onClose, onCreated }: Props) {
  const { t } = useTranslation("workflows");
  const [name,    setName]   = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("invoice_overdue");
  const [action,  setAction]  = useState<AutomationAction>("create_task");
  const [config,  setConfig]  = useState<AutomationConfig>({
    title: t("automations.modal.defaults.taskInvoiceOverdue", KEEP_TOKENS),
    due_offset_days: 1,
  });
  const [error,   setError]   = useState("");
  const [pending, start] = useTransition();

  // Reset config defaults when action changes
  function handleActionChange(next: AutomationAction) {
    setAction(next);
    if (next === "create_task") {
      setConfig({ title: t("automations.modal.defaults.taskGeneric", KEEP_TOKENS), due_offset_days: 1 });
    } else if (next === "send_email") {
      setConfig({ email_subject: DEFAULT_EMAIL_SUBJECT, email_body: DEFAULT_EMAIL_BODY });
    } else {
      setConfig({ note_body: t("automations.modal.defaults.note") });
    }
  }

  function handleTriggerChange(next: AutomationTrigger) {
    setTrigger(next);
    // Keep config but update task title default
    if (action === "create_task") {
      const key =
        next === "invoice_overdue" ? "taskInvoiceOverdue"
        : next === "invoice_paid"  ? "taskInvoicePaid"
        : next === "new_lead"      ? "taskNewLead"
        : "taskCampaignSent";
      setConfig((c) => ({ ...c, title: t(`automations.modal.defaults.${key}`, KEEP_TOKENS) }));
    }
  }

  function handleSubmit() {
    if (!name.trim()) { setError(t("automations.modal.nameRequired")); return; }
    setError("");

    start(async () => {
      try {
        const id = await createAutomationRule({
          name: name.trim(),
          trigger,
          action,
          config,
        });

        onCreated({
          id,
          name: name.trim(),
          enabled: true,
          trigger,
          action,
          config,
          run_count: 0,
          last_run_at: null,
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("create automation", err);
        setError(t("automations.modal.createFailed"));
      }
    });
  }

  const vars = TRIGGER_VARS[trigger];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">{t("automations.modal.title")}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("automations.modal.close")}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[calc(100vh-160px)] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("automations.modal.nameLabel")}</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder={t("automations.modal.namePlaceholder")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("automations.modal.whenLabel")}</label>
            <div className="space-y-1.5">
              {TRIGGERS.map((value) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    trigger === value
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="trigger"
                    value={value}
                    checked={trigger === value}
                    onChange={() => handleTriggerChange(value)}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className={`text-xs font-medium ${trigger === value ? "text-indigo-800" : "text-slate-700"}`}>
                      {t(`automations.modal.triggers.${value}.label`)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t(`automations.modal.triggers.${value}.hint`)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("automations.modal.doLabel")}</label>
            <div className="space-y-1.5">
              {ACTIONS.map((value) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    action === value
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value={value}
                    checked={action === value}
                    onChange={() => handleActionChange(value)}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className={`text-xs font-medium ${action === value ? "text-indigo-800" : "text-slate-700"}`}>
                      {t(`automations.modal.actions.${value}.label`)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t(`automations.modal.actions.${value}.hint`)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Dynamic config fields */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-600">{t("automations.modal.configureAction")}</p>
              {vars.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {vars.map((v) => (
                    <code key={v} className="text-[10px] bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-mono text-indigo-600">
                      {v}
                    </code>
                  ))}
                </div>
              )}
            </div>

            {action === "create_task" && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t("automations.modal.taskTitleLabel")}</label>
                  <input
                    value={config.title ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))}
                    placeholder={t("automations.modal.taskTitlePlaceholder", KEEP_TOKENS)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t("automations.modal.dueInDaysLabel")}</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={config.due_offset_days ?? 1}
                    onChange={(e) => setConfig((c) => ({ ...c, due_offset_days: Number(e.target.value) }))}
                    className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </>
            )}

            {action === "send_email" && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t("automations.modal.emailSubjectLabel")}</label>
                  <input
                    value={config.email_subject ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, email_subject: e.target.value }))}
                    placeholder="Invoice {{invoice_number}} payment reminder"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t("automations.modal.emailBodyLabel")}</label>
                  <textarea
                    rows={5}
                    value={config.email_body ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, email_body: e.target.value }))}
                    placeholder="Hi {{client_name}},&#10;&#10;Just a reminder that invoice {{invoice_number}} ({{amount}}) is overdue.&#10;&#10;Please reach out if you have any questions."
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </>
            )}

            {action === "add_note" && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t("automations.modal.noteBodyLabel")}</label>
                <textarea
                  rows={3}
                  value={config.note_body ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, note_body: e.target.value }))}
                  placeholder={t("automations.modal.notePlaceholder", KEEP_TOKENS)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2" role="alert">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            {t("automations.modal.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending || !name.trim()}
            className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {pending ? t("automations.modal.creating") : t("automations.modal.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

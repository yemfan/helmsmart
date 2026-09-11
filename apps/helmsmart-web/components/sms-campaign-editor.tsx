"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Send, Clock, Users, AlertCircle, Smartphone,
} from "lucide-react";
import { createSMSCampaign, updateSMSCampaign, sendSMSCampaignNow, deleteSMSCampaign } from "@/lib/actions/sms-campaigns";
// Message bodies the org sends to ITS customers — see the module header for
// why they are not translated (the STOP wording is a carrier requirement).
import { smsTemplates } from "@/lib/marketing-content";

// Values are the stored segment vocabulary; labels come from
// `sms.editor.segments.<value>Label` / `…Desc`.
const SEGMENTS = ["all", "leads", "prospects", "active", "won"] as const;

interface Props {
  campaignId?: string;
  initialValues?: {
    name: string;
    description: string;
    messageText: string;
    targetSegment: string;
    scheduledFor: string;
  };
  status?: string;
}

export function SMSCampaignEditor({ campaignId, initialValues, status }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation("marketing");
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [messageText, setMessageText] = useState(initialValues?.messageText ?? "");
  const [targetSegment, setTargetSegment] = useState<string>(
    initialValues?.targetSegment ?? "all"
  );
  const [scheduledFor, setScheduledFor] = useState(initialValues?.scheduledFor ?? "");
  const [scheduleEnabled, setScheduleEnabled] = useState(!!initialValues?.scheduledFor);
  const [error, setError] = useState<string | null>(null);
  const [sendConfirm, setSendConfirm] = useState(false);

  const charCount = messageText.length;
  const smsCount = Math.ceil(charCount / 160) || 1;
  const isEditable = !status || status === "draft" || status === "scheduled";

  const handleSaveDraft = () => {
    if (!name.trim() || !messageText.trim()) {
      setError(t("sms.editor.errors.required"));
      return;
    }
    setError(null);
    startTransition(async () => {
      if (campaignId) {
        const result = await updateSMSCampaign(campaignId, {
          name: name.trim(),
          description: description.trim() || undefined,
          messageText: messageText.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won" | "custom",
          scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : undefined,
        });
        if (!result.ok) {
          setError(result.error ?? t("sms.editor.errors.saveFailed"));
        } else {
          router.refresh();
        }
      } else {
        const result = await createSMSCampaign({
          name: name.trim(),
          description: description.trim() || undefined,
          messageText: messageText.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won" | "custom",
          scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : undefined,
        });
        if (!result.ok) {
          setError(result.error ?? t("sms.editor.errors.saveFailed"));
        } else {
          router.push(`/marketing/sms/${result.campaignId}`);
        }
      }
    });
  };

  const handleSendNow = () => {
    if (!sendConfirm) {
      setSendConfirm(true);
      return;
    }
    setSendConfirm(false);
    if (!campaignId) {
      // Save first, then send
      startTransition(async () => {
        const result = await createSMSCampaign({
          name: name.trim(),
          description: description.trim() || undefined,
          messageText: messageText.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won" | "custom",
        });
        if (!result.ok) {
          setError(result.error ?? t("sms.editor.errors.saveFailed"));
          return;
        }
        const sendResult = await sendSMSCampaignNow(result.campaignId!);
        if (!sendResult.ok) {
          setError(sendResult.error ?? t("sms.editor.errors.sendFailed"));
        } else {
          router.push("/marketing/sms");
        }
      });
    } else {
      startTransition(async () => {
        const result = await sendSMSCampaignNow(campaignId);
        if (!result.ok) {
          setError(result.error ?? t("sms.editor.errors.sendFailed"));
        } else {
          router.push("/marketing/sms");
        }
      });
    }
  };

  const handleDelete = () => {
    if (!campaignId) return;
    startTransition(async () => {
      await deleteSMSCampaign(campaignId);
      router.push("/marketing/sms");
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/marketing/sms"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            {campaignId ? t("sms.editor.titleEdit") : t("sms.editor.titleNew")}
          </h1>
          {status && (
            <p className="text-xs text-slate-500 mt-0.5">
              {t("sms.editor.statusLine", {
                status: t(`sms.statusLabels.${status}`, { defaultValue: status }),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Campaign name */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <label className="block text-sm font-semibold text-slate-800 mb-4">
            {t("sms.editor.detailsTitle")}
          </label>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t("sms.editor.nameLabel")} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEditable || isPending}
                placeholder={t("sms.editor.namePlaceholder")}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t("sms.editor.descriptionLabel")}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isEditable || isPending}
                placeholder={t("sms.editor.descriptionPlaceholder")}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-semibold text-slate-800">
              {t("sms.editor.messageLabel")} <span className="text-rose-500">*</span>
            </label>
            <span className={`text-xs font-medium ${charCount > 800 ? "text-rose-500" : "text-slate-400"}`}>
              {t("sms.editor.charCount", { chars: charCount, count: smsCount })}
            </span>
          </div>

          {/* Templates */}
          {isEditable && (
            <div className="mb-3">
              <p className="text-xs font-medium text-slate-500 mb-2">{t("sms.editor.quickTemplates")}</p>
              <div className="flex flex-wrap gap-2">
                {smsTemplates(i18n.language).map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setMessageText(tpl.text)}
                    disabled={isPending}
                    className="text-xs px-2.5 py-1 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-indigo-200 transition-colors disabled:opacity-50"
                  >
                    {t(`sms.editor.templates.${tpl.key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={!isEditable || isPending}
            placeholder={t("sms.editor.messagePlaceholder")}
            rows={5}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-60 disabled:bg-slate-50"
          />

          {/* Preview */}
          {messageText && (
            <div className="mt-4 bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 font-medium">
                <Smartphone className="w-3.5 h-3.5" />
                {t("sms.editor.preview")}
              </div>
              <div className="max-w-xs">
                <div className="bg-emerald-500 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 leading-relaxed inline-block">
                  {messageText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Target audience */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-slate-500" />
            <label className="text-sm font-semibold text-slate-800">{t("sms.editor.audienceTitle")}</label>
          </div>
          <div className="space-y-2">
            {SEGMENTS.map((seg) => (
              <label
                key={seg}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  targetSegment === seg
                    ? "bg-indigo-50 border-indigo-200"
                    : "border-slate-100 hover:bg-slate-50"
                } ${!isEditable ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="segment"
                  value={seg}
                  checked={targetSegment === seg}
                  onChange={() => setTargetSegment(seg)}
                  disabled={!isEditable || isPending}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{t(`sms.editor.segments.${seg}Label`)}</p>
                  <p className="text-xs text-slate-500">{t(`sms.editor.segments.${seg}Desc`)}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{t("sms.editor.optOutNote")}</span>
          </div>
        </div>

        {/* Schedule */}
        {isEditable && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <label className="text-sm font-semibold text-slate-800">{t("sms.editor.scheduleTitle")}</label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-500">{t("sms.editor.scheduleToggle")}</span>
                <div
                  onClick={() => setScheduleEnabled((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                    scheduleEnabled ? "bg-indigo-600" : "bg-slate-200"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      scheduleEnabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>

            {scheduleEnabled ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("sms.editor.sendAt")}
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  disabled={isPending}
                  min={new Date().toISOString().slice(0, 16)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t("sms.editor.sendNowHint")}</p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Send confirm */}
        {sendConfirm && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-900 mb-1">
              {t("sms.editor.confirmTitle")}
            </p>
            <p className="text-xs text-amber-700 mb-4">
              {t("sms.editor.confirmBody")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSendNow}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {t("sms.editor.confirmYes")}
              </button>
              <button
                onClick={() => setSendConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {isEditable && !sendConfirm && (
          <div className="flex items-center gap-3">
            {!scheduleEnabled ? (
              <button
                onClick={handleSendNow}
                disabled={isPending || !name.trim() || !messageText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {isPending ? t("common:status.sending") : t("sms.editor.sendNow")}
              </button>
            ) : (
              <button
                onClick={handleSaveDraft}
                disabled={isPending || !name.trim() || !messageText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5" />
                {isPending ? t("common:status.scheduling") : t("sms.editor.scheduleCampaign")}
              </button>
            )}
            <button
              onClick={handleSaveDraft}
              disabled={isPending || !name.trim() || !messageText.trim()}
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isPending ? t("common:status.saving") : t("sms.editor.saveDraft")}
            </button>
            {campaignId && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-medium disabled:opacity-50"
              >
                {t("sms.editor.delete")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

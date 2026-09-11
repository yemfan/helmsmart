"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { ArrowLeft, Send, Clock, Users, AlertCircle, Eye, Repeat } from "lucide-react";
import { createEmailCampaign, updateEmailCampaign, sendEmailCampaignNow, deleteEmailCampaign } from "@/lib/actions/email-campaigns";
// Bodies and subjects the org sends to ITS customers — see the module header
// for why they are not translated. Only the template NAME is copy.
import { emailTemplates } from "@/lib/marketing-content";

// Values are the stored segment vocabulary; labels come from
// `email.editor.segments.<value>Label` / `…Desc`.
const SEGMENTS = ["all", "leads", "prospects", "active", "won"] as const;

const DOW = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

interface Props {
  campaignId?: string;
  initialValues?: {
    name: string;
    subject: string;
    previewText: string;
    bodyHtml: string;
    fromName: string;
    replyTo: string;
    targetSegment: string;
    scheduledFor: string;
  };
  status?: string;
}

export function EmailCampaignEditor({ campaignId, initialValues, status }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation("marketing");
  const [isPending, startTransition] = useTransition();

  const [name, setName]               = useState(initialValues?.name ?? "");
  const [subject, setSubject]         = useState(initialValues?.subject ?? "");
  const [previewText, setPreviewText] = useState(initialValues?.previewText ?? "");
  const [bodyHtml, setBodyHtml]       = useState(initialValues?.bodyHtml ?? emailTemplates(i18n.language)[0].body);
  const [fromName, setFromName]       = useState(initialValues?.fromName ?? "");
  const [replyTo, setReplyTo]         = useState(initialValues?.replyTo ?? "");
  const [targetSegment, setTargetSegment] = useState(initialValues?.targetSegment ?? "all");
  const [scheduledFor, setScheduledFor]   = useState(initialValues?.scheduledFor ?? "");
  const [scheduleEnabled, setScheduleEnabled] = useState(!!initialValues?.scheduledFor);

  // Recurrence
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurInterval, setRecurInterval]       = useState<"weekly" | "monthly">("monthly");
  const [recurDay, setRecurDay]                 = useState(1);
  const [recurHour, setRecurHour]               = useState(9);

  const [activeTab, setActiveTab]   = useState<"content" | "audience" | "settings">("content");
  const [showPreview, setShowPreview] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const isEditable = !status || status === "draft" || status === "scheduled";

  const handleSaveDraft = () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      setError(t("email.editor.errors.required"));
      return;
    }
    setError(null);
    setSaved(false);

    startTransition(async () => {
      if (campaignId) {
        const result = await updateEmailCampaign(campaignId, {
          name: name.trim(),
          subject: subject.trim(),
          previewText: previewText.trim(),
          bodyHtml,
          fromName: fromName.trim(),
          replyTo: replyTo.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won",
          scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : "",
        });
        if (!result.ok) { setError(result.error ?? t("email.editor.errors.saveFailed")); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const result = await createEmailCampaign({
          name: name.trim(),
          subject: subject.trim(),
          previewText: previewText.trim(),
          bodyHtml,
          fromName: fromName.trim(),
          replyTo: replyTo.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won",
          scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : undefined,
        });
        if (!result.ok) { setError(result.error ?? t("email.editor.errors.createFailed")); return; }
        router.push(`/marketing/email/${result.campaignId}`);
      }
    });
  };

  const handleSend = () => {
    if (!sendConfirm) { setSendConfirm(true); return; }
    setSendConfirm(false);
    startTransition(async () => {
      // Save first if new
      if (!campaignId) {
        const createResult = await createEmailCampaign({
          name: name.trim(), subject: subject.trim(), previewText: previewText.trim(),
          bodyHtml, fromName: fromName.trim(), replyTo: replyTo.trim(),
          targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won",
        });
        if (!createResult.ok) { setError(createResult.error ?? t("email.editor.errors.createFailed")); return; }
        const sendResult = await sendEmailCampaignNow(createResult.campaignId!);
        if (!sendResult.ok) { setError(sendResult.error ?? t("email.editor.errors.sendFailed")); return; }
        router.push("/marketing/email");
      } else {
        const sendResult = await sendEmailCampaignNow(campaignId);
        if (!sendResult.ok) { setError(sendResult.error ?? t("email.editor.errors.sendFailed")); return; }
        router.push("/marketing/email");
      }
    });
  };

  const handleSaveRecurring = () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      setError(t("email.editor.errors.required"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createEmailCampaign({
        name: name.trim(),
        subject: subject.trim(),
        previewText: previewText.trim(),
        bodyHtml,
        fromName: fromName.trim(),
        replyTo: replyTo.trim(),
        targetSegment: targetSegment as "all" | "leads" | "prospects" | "active" | "won",
        isRecurring: true,
        recurrenceInterval: recurInterval,
        recurrenceDay: recurDay,
        recurrenceHour: recurHour,
      });
      if (!result.ok) { setError(result.error ?? t("email.editor.errors.createFailed")); return; }
      router.push("/marketing/email");
    });
  };

  const handleDelete = () => {
    if (!campaignId || !confirm(t("email.editor.confirmDelete"))) return;
    startTransition(async () => {
      await deleteEmailCampaign(campaignId);
      router.push("/marketing/email");
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/marketing/email" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 flex-1">
          {campaignId ? t("email.editor.titleEdit") : t("email.editor.titleNew")}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowPreview((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? t("email.editor.edit") : t("email.editor.preview")}
          </button>
          {isEditable && (
            <button
              onClick={handleSaveDraft}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {saved ? t("email.editor.saved") : t("email.editor.saveDraft")}
            </button>
          )}
        </div>
      </div>

      {showPreview ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-1">
              {t("email.editor.previewSubject", { subject: subject || t("email.editor.noSubject") })}
            </p>
            {previewText && <p className="text-xs text-slate-400">{previewText}</p>}
          </div>
          <div
            className="p-8 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: bodyHtml
              .replace(/\{\{name\}\}/gi, t("email.editor.sampleName"))
              .replace(/\{\{org_name\}\}/gi, t("email.editor.sampleOrg"))
              .replace(/\{\{month\}\}/gi, new Date().toLocaleDateString(intlLocale(i18n.language), { month: "long", year: "numeric" }))
            }}
          />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit">
            {(["content", "audience", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t(`email.editor.tabs.${tab}`)}
              </button>
            ))}
          </div>

          {/* Campaign name always visible */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.nameLabel")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!isEditable || isPending}
                  placeholder={t("email.editor.namePlaceholder")} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.subjectLabel")}</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isEditable || isPending}
                  placeholder={t("email.editor.subjectPlaceholder", { orgTag: "{{org_name}}" })} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
              </div>
            </div>
          </div>

          {activeTab === "content" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.previewTextLabel")}</label>
                <input type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} disabled={!isEditable || isPending}
                  placeholder={t("email.editor.previewTextPlaceholder")} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
              </div>

              {/* Template buttons */}
              {isEditable && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">{t("email.editor.loadTemplate")}</p>
                  <div className="flex gap-2 flex-wrap">
                    {emailTemplates(i18n.language).map((tpl) => (
                      <button key={tpl.key} type="button" onClick={() => { setBodyHtml(tpl.body); setSubject(tpl.subject); }}
                        disabled={isPending}
                        className="text-xs px-2.5 py-1 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                        {t(`email.editor.templates.${tpl.key}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600">{t("email.editor.bodyLabel")}</label>
                  <span className="text-xs text-slate-400">
                    {t("email.editor.mergeTags", { tags: "{{name}}, {{org_name}}, {{email}}" })}
                  </span>
                </div>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  disabled={!isEditable || isPending}
                  rows={20}
                  className="w-full text-sm font-mono border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {activeTab === "audience" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("email.editor.audienceTitle")}</h2>
              </div>
              <div className="space-y-2">
                {SEGMENTS.map((seg) => (
                  <label key={seg} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    targetSegment === seg ? "bg-indigo-50 border-indigo-200" : "border-slate-100 hover:bg-slate-50"
                  } ${!isEditable ? "pointer-events-none opacity-60" : ""}`}>
                    <input type="radio" name="segment" value={seg} checked={targetSegment === seg}
                      onChange={() => setTargetSegment(seg)} disabled={!isEditable || isPending} className="mt-0.5 text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t(`email.editor.segments.${seg}Label`)}</p>
                      <p className="text-xs text-slate-500">{t(`email.editor.segments.${seg}Desc`)}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {t("email.editor.audienceNote")}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-800">{t("email.editor.senderTitle")}</h2>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.fromNameLabel")}</label>
                  <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} disabled={!isEditable || isPending}
                    placeholder={t("email.editor.fromNamePlaceholder")} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.replyToLabel")}</label>
                  <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} disabled={!isEditable || isPending}
                    placeholder={t("email.editor.replyToPlaceholder")} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
                </div>
              </div>

              {isEditable && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <h2 className="text-sm font-semibold text-slate-800">{t("email.editor.scheduleTitle")}</h2>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{t("email.editor.scheduleToggle")}</span>
                      <div onClick={() => setScheduleEnabled((v) => !v)}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${scheduleEnabled ? "bg-indigo-600" : "bg-slate-200"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </label>
                  </div>
                  {scheduleEnabled ? (
                    <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)} disabled={isPending}
                      className="text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  ) : (
                    <p className="text-xs text-slate-400">{t("email.editor.sendNowHint")}</p>
                  )}
                </div>
              )}

              {/* Recurrence — only for new campaigns */}
              {isEditable && !campaignId && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-slate-500" />
                      <h2 className="text-sm font-semibold text-slate-800">{t("email.editor.recurringTitle")}</h2>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{t("email.editor.recurringToggle")}</span>
                      <div onClick={() => { setRecurringEnabled((v) => !v); if (!recurringEnabled) setScheduleEnabled(false); }}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${recurringEnabled ? "bg-indigo-600" : "bg-slate-200"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${recurringEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </label>
                  </div>
                  {recurringEnabled ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        {(["weekly", "monthly"] as const).map((iv) => (
                          <button key={iv} type="button" onClick={() => { setRecurInterval(iv); setRecurDay(1); }}
                            className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${recurInterval === iv ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                            {t(`email.editor.${iv}`)}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            {recurInterval === "weekly" ? t("email.editor.dayOfWeek") : t("email.editor.dayOfMonth")}
                          </label>
                          {recurInterval === "weekly" ? (
                            <select value={recurDay} onChange={(e) => setRecurDay(Number(e.target.value))} disabled={isPending}
                              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60">
                              {DOW.map((d, i) => <option key={d} value={i}>{t(`email.editor.days.${d}`)}</option>)}
                            </select>
                          ) : (
                            <select value={recurDay} onChange={(e) => setRecurDay(Number(e.target.value))} disabled={isPending}
                              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60">
                              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("email.editor.hourUtc")}</label>
                          <select value={recurHour} onChange={(e) => setRecurHour(Number(e.target.value))} disabled={isPending}
                            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60">
                            {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                              <option key={h} value={h}>
                                {t("email.editor.hourOption", {
                                  hour: h % 12 === 0 ? 12 : h % 12,
                                  ampm: h < 12 ? t("email.editor.am") : t("email.editor.pm"),
                                })}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">
                        {t("email.editor.recurringNote")}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">{t("email.editor.recurringOff")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Send confirm */}
          {sendConfirm && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-900 mb-1">{t("email.editor.confirmTitle")}</p>
              <p className="text-xs text-amber-700 mb-4">{t("email.editor.confirmBody")}</p>
              <div className="flex gap-3">
                <button onClick={handleSend} disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                  {t("email.editor.confirmYes")}
                </button>
                <button onClick={() => setSendConfirm(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  {t("common:actions.cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {isEditable && !sendConfirm && (
            <div className="mt-5 flex items-center gap-3">
              {recurringEnabled ? (
                <button onClick={handleSaveRecurring} disabled={isPending || !name.trim() || !subject.trim() || !bodyHtml.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  <Repeat className="w-3.5 h-3.5" />
                  {isPending ? t("common:status.saving") : t("email.editor.saveRecurring")}
                </button>
              ) : !scheduleEnabled ? (
                <button onClick={handleSend} disabled={isPending || !name.trim() || !subject.trim() || !bodyHtml.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                  {isPending ? t("common:status.sending") : t("email.editor.sendNow")}
                </button>
              ) : (
                <button onClick={handleSaveDraft} disabled={isPending || !name.trim() || !subject.trim() || !bodyHtml.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  <Clock className="w-3.5 h-3.5" />
                  {isPending ? t("common:status.scheduling") : t("email.editor.scheduleCampaign")}
                </button>
              )}
              {campaignId && (
                <button onClick={handleDelete} disabled={isPending}
                  className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-medium disabled:opacity-50">
                  {t("email.editor.delete")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Send, Eye, EyeOff, Sparkles } from "lucide-react";
import { createCampaign, sendCampaign, generateCampaignCopy, generateSubjectLines, refineCampaignBody, type CampaignTone, type RefineMode } from "@/lib/actions/campaigns";

type RecipientFilter = "all" | "active" | "leads" | "prospects" | "inactive";

// Values are the stored/queried vocabulary; the label and blurb come from
// `campaigns.form.segments.<value>Label` / `…Desc`.
const SEGMENTS: RecipientFilter[] = ["all", "active", "leads", "prospects", "inactive"];

const REFINE_MODES: RefineMode[] = ["shorten", "persuasive", "casual", "formal", "grammar"];

const TONES: CampaignTone[] = ["promotional", "friendly", "professional", "announcement"];

export function CampaignForm({ availableTags }: { availableTags: string[] }) {
  const router = useRouter();
  const { t } = useTranslation("marketing");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>("active");
  const [recipientTag, setRecipientTag] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState("");

  const [aiPrompt, setAiPrompt]   = useState("");
  const [aiTone, setAiTone]       = useState<CampaignTone>("promotional");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");

  const [subjectIdeas, setSubjectIdeas]     = useState<string[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError]     = useState("");

  const [refineLoading, setRefineLoading] = useState(false);
  const [refineMode, setRefineMode]       = useState<RefineMode | null>(null);

  async function refine(mode: RefineMode) {
    if (!body.trim()) return;
    setRefineMode(mode);
    setRefineLoading(true);
    setError("");
    try {
      const improved = await refineCampaignBody({ body: body.trim(), mode });
      if (improved) { setBody(improved); setPreview(false); }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("campaigns.form.errors.refineFailed"));
    } finally {
      setRefineLoading(false);
      setRefineMode(null);
    }
  }

  async function suggestSubjects() {
    const context = body.trim() || aiPrompt.trim();
    if (!context) { setSubjectError(t("campaigns.form.errors.contextFirst")); return; }
    setSubjectError("");
    setSubjectLoading(true);
    try {
      const ideas = await generateSubjectLines({ context, tone: aiTone });
      setSubjectIdeas(ideas);
    } catch (err) {
      setSubjectError(err instanceof Error ? err.message : t("campaigns.form.errors.suggestFailed"));
    } finally {
      setSubjectLoading(false);
    }
  }

  async function generateCopy() {
    if (!aiPrompt.trim()) return;
    setAiError("");
    setAiLoading(true);
    try {
      const { subject: s, body: b } = await generateCampaignCopy({ prompt: aiPrompt.trim(), tone: aiTone });
      if (s) setSubject(s);
      if (b) setBody(b);
      if (!name.trim() && s) setName(s);
      setPreview(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t("campaigns.form.errors.generateFailed"));
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(sendNow: boolean) {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError(t("campaigns.form.errors.required"));
      return;
    }
    setError("");
    setLoading(true);
    setAction(sendNow ? "send" : "draft");

    try {
      const id = await createCampaign({
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        recipient_filter: filter,
        recipient_tag: recipientTag || null,
      });

      if (sendNow) {
        await sendCampaign(id);
        router.push(`/marketing/${id}`);
      } else {
        router.push(`/marketing/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("campaigns.form.errors.generic"));
    } finally {
      setLoading(false);
      setAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* AI copywriter */}
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-800">{t("campaigns.form.aiTitle")}</h2>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("campaigns.form.aiPromptLabel")}
          </label>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={2}
            placeholder={t("campaigns.form.aiPromptPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={aiTone}
            onChange={(e) => setAiTone(e.target.value as CampaignTone)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TONES.map((tone) => (
              <option key={tone} value={tone}>{t(`campaigns.form.tones.${tone}`)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={generateCopy}
            disabled={aiLoading || !aiPrompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {aiLoading ? t("common:status.writing") : t("campaigns.form.generate")}
          </button>
          {aiError && <span className="text-xs text-rose-600">{aiError}</span>}
        </div>
        <p className="text-[11px] text-slate-400">
          {t("campaigns.form.aiNote")}
        </p>
      </div>

      {/* Campaign name */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("campaigns.form.detailsTitle")}</h2>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("campaigns.form.nameLabel")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("campaigns.form.namePlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-600">{t("campaigns.form.subjectLabel")}</label>
            <button
              type="button"
              onClick={suggestSubjects}
              disabled={subjectLoading}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              {subjectLoading ? t("common:status.thinking") : t("campaigns.form.suggest")}
            </button>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("campaigns.form.subjectPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {subjectError && <p className="text-xs text-rose-600 mt-1">{subjectError}</p>}
          {subjectIdeas.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {subjectIdeas.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setSubject(s); setSubjectIdeas([]); }}
                  title={t("campaigns.form.useSubject")}
                  className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {t("campaigns.form.subjectCount", { count: subject.length })}
          </p>
        </div>
      </div>

      {/* Recipient segment */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">{t("campaigns.form.recipientsTitle")}</h2>
        <div className="grid grid-cols-5 gap-2">
          {SEGMENTS.map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setFilter(seg)}
              className={`flex flex-col items-center text-center p-3 rounded-xl border-2 transition-colors ${
                filter === seg
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50"
              }`}
            >
              <span className="text-xs font-semibold">{t(`campaigns.form.segments.${seg}Label`)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5">{t(`campaigns.form.segments.${seg}Desc`)}</span>
            </button>
          ))}
        </div>

        {availableTags.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-slate-600">{t("campaigns.form.alsoTagged")}</label>
            <select
              value={recipientTag}
              onChange={(e) => setRecipientTag(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t("campaigns.form.anyTag")}</option>
              {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
            {recipientTag && (
              <span className="text-xs text-slate-400">
                {t("campaigns.form.onlyTagged", { tag: recipientTag })}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-3">
          {t("campaigns.form.recipientsNote")}
        </p>
      </div>

      {/* Body */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">{t("campaigns.form.messageTitle")}</h2>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {body.trim() && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />{t("campaigns.form.refine")}
                </span>
                {REFINE_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={refineLoading}
                    onClick={() => refine(mode)}
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {refineLoading && refineMode === mode ? "…" : t(`campaigns.form.refineModes.${mode}`)}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? t("campaigns.form.edit") : t("campaigns.form.preview")}
            </button>
          </div>
        </div>

        {preview ? (
          <div className="min-h-48 bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">
              {t("campaigns.form.previewSubject", { subject: subject || t("campaigns.form.noSubject") })}
            </p>
            <div className="border-t border-slate-200 pt-3 space-y-2">
              {body.split("\n").map((line, i) =>
                line.trim() ? (
                  <p key={i} className="text-sm text-slate-700 leading-relaxed">
                    {line}
                  </p>
                ) : (
                  <div key={i} className="h-2" />
                )
              )}
            </div>
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder={t("campaigns.form.bodyPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
          />
        )}
        <p className="text-xs text-slate-400 mt-2">
          {t("campaigns.form.bodyNote")}
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-3" role="alert">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleSubmit(false)}
          disabled={loading}
          className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {loading && action === "draft" ? t("common:status.saving") : t("campaigns.form.saveDraft")}
        </button>
        <button
          type="button"
          onClick={() => handleSubmit(true)}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {loading && action === "send" ? (
            t("common:status.sending")
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t("campaigns.form.send")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

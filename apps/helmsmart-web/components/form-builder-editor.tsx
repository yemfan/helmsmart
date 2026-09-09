"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Plus, Trash2, GripVertical, CheckCircle2, AlertCircle,
  Copy, Eye,
} from "lucide-react";
import { createForm, updateForm, deleteForm, type FormField } from "@/lib/actions/forms";
// Seed content that becomes the org's OWN public form — see the module
// header for why it follows their visitors' language, not the owner's UI.
import {
  DEFAULT_FORM_FIELDS,
  DEFAULT_FORM_SLUG,
  DEFAULT_FORM_TITLE,
  DEFAULT_SUCCESS_MESSAGE,
  NEW_FIELD_LABEL,
} from "@/lib/marketing-content";

// Values are the stored field-type vocabulary the public renderer reads; the
// labels come from `forms.builder.fieldTypes.<value>`.
const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "checkbox"] as const;

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function generateFieldId(): string {
  return `field_${Math.random().toString(36).slice(2, 9)}`;
}

interface Props {
  formId?: string;
  initialValues?: {
    title: string;
    description: string;
    slug: string;
    fields: FormField[];
    successMessage: string;
    autoCreateClient: boolean;
    notifyEmail: string;
    notifySms: boolean;
    redirectUrl: string;
    isActive: boolean;
  };
}

export function FormBuilderEditor({ formId, initialValues }: Props) {
  const router = useRouter();
  const { t } = useTranslation("marketing");
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialValues?.title ?? DEFAULT_FORM_TITLE);
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [slug, setSlug] = useState(initialValues?.slug ?? DEFAULT_FORM_SLUG);
  const [fields, setFields] = useState<FormField[]>(
    initialValues?.fields ?? DEFAULT_FORM_FIELDS
  );
  const [successMessage, setSuccessMessage] = useState(
    initialValues?.successMessage ?? DEFAULT_SUCCESS_MESSAGE
  );
  const [autoCreateClient, setAutoCreateClient] = useState(
    initialValues?.autoCreateClient ?? true
  );
  const [notifyEmail, setNotifyEmail] = useState(initialValues?.notifyEmail ?? "");
  const [redirectUrl, setRedirectUrl] = useState(initialValues?.redirectUrl ?? "");
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "settings">("fields");
  const [slugCopied, setSlugCopied] = useState(false);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!formId) setSlug(generateSlug(v));
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: generateFieldId(),
        type: "text",
        label: NEW_FIELD_LABEL,
        placeholder: "",
        required: false,
      },
    ]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!title.trim() || !slug.trim()) {
      setError(t("forms.builder.errors.required"));
      return;
    }
    if (fields.length === 0) {
      setError(t("forms.builder.errors.noFields"));
      return;
    }
    setError(null);
    setSaved(false);

    startTransition(async () => {
      if (formId) {
        const result = await updateForm(formId, {
          title: title.trim(),
          description: description.trim(),
          slug: slug.trim(),
          fields,
          successMessage: successMessage.trim(),
          autoCreateClient,
          notifyEmail: notifyEmail.trim(),
          redirectUrl: redirectUrl.trim(),
          isActive,
        });
        if (!result.ok) {
          setError(result.error ?? t("forms.builder.errors.saveFailed"));
        } else {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } else {
        const result = await createForm({
          title: title.trim(),
          description: description.trim(),
          slug: slug.trim(),
          fields,
          successMessage: successMessage.trim(),
          autoCreateClient,
          notifyEmail: notifyEmail.trim(),
          redirectUrl: redirectUrl.trim(),
        });
        if (!result.ok) {
          setError(result.error ?? t("forms.builder.errors.createFailed"));
        } else {
          router.push(`/forms/${result.formId}`);
        }
      }
    });
  };

  const handleDelete = () => {
    if (!formId || !confirm(t("forms.builder.confirmDelete"))) return;
    startTransition(async () => {
      await deleteForm(formId);
      router.push("/forms");
    });
  };

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${appUrl}/f/${slug}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/forms"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            {formId ? t("forms.builder.titleEdit") : t("forms.builder.titleNew")}
          </h1>
        </div>
        <div className="flex gap-2">
          {formId && (
            <a
              href={`/f/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              {t("forms.builder.preview")}
            </a>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t("forms.builder.saved")}
              </>
            ) : isPending ? (
              t("common:status.saving")
            ) : (
              t("forms.builder.save")
            )}
          </button>
        </div>
      </div>

      {/* Form title + URL */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("forms.builder.titleLabel")} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              disabled={isPending}
              placeholder={t("forms.builder.titlePlaceholder")}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("forms.builder.slugLabel")} <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                <span className="text-xs text-slate-400 px-2 whitespace-nowrap">/f/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  disabled={isPending}
                  className="flex-1 text-sm py-2.5 pr-3 focus:outline-none disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={copyUrl}
                disabled={!formId}
                title={t("forms.builder.copyUrl")}
                className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 disabled:opacity-30 transition-colors"
              >
                {slugCopied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("forms.builder.descriptionLabel")}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            placeholder={t("forms.builder.descriptionPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit">
        {(["fields", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "fields" ? t("forms.builder.tabFields") : t("forms.builder.tabSettings")}
          </button>
        ))}
      </div>

      {activeTab === "fields" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{t("forms.builder.fieldsTitle")}</h2>
            <button
              type="button"
              onClick={addField}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("forms.builder.addField")}
            </button>
          </div>

          <div className="divide-y divide-slate-50">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-2 text-slate-300 cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    {/* Label */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {t("forms.builder.fieldLabel")}
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        disabled={isPending}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </div>
                    {/* Type */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {t("forms.builder.fieldType")}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(index, { type: e.target.value as FormField["type"] })}
                        disabled={isPending}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                      >
                        {FIELD_TYPES.map((value) => (
                          <option key={value} value={value}>
                            {t(`forms.builder.fieldTypes.${value}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Placeholder */}
                    {field.type !== "checkbox" && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {t("forms.builder.fieldPlaceholder")}
                        </label>
                        <input
                          type="text"
                          value={field.placeholder ?? ""}
                          onChange={(e) => updateField(index, { placeholder: e.target.value })}
                          disabled={isPending}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                        />
                      </div>
                    )}
                    {/* Options for select */}
                    {field.type === "select" && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {t("forms.builder.fieldOptions")}
                        </label>
                        <input
                          type="text"
                          value={(field.options ?? []).join(", ")}
                          onChange={(e) =>
                            updateField(index, {
                              options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                            })
                          }
                          disabled={isPending}
                          placeholder={t("forms.builder.fieldOptionsPlaceholder")}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                        />
                      </div>
                    )}
                    {/* Required toggle */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`required-${field.id}`}
                        checked={field.required ?? false}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                        disabled={isPending}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                      />
                      <label
                        htmlFor={`required-${field.id}`}
                        className="text-xs font-medium text-slate-600 cursor-pointer"
                      >
                        {t("forms.builder.fieldRequired")}
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    disabled={isPending || fields.length <= 1}
                    className="mt-2 p-1.5 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-5">
          {/* Success message */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("forms.builder.afterSubmission")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("forms.builder.successMessage")}
                </label>
                <input
                  type="text"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("forms.builder.redirectUrl")}
                </label>
                <input
                  type="url"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  disabled={isPending}
                  placeholder={t("forms.builder.redirectPlaceholder")}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* CRM & notifications */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("forms.builder.crmTitle")}</h3>
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateClient}
                  onChange={(e) => setAutoCreateClient(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("forms.builder.autoCreate")}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("forms.builder.autoCreateHint")}
                  </p>
                </div>
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("forms.builder.notifyEmail")}
                </label>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  disabled={isPending}
                  placeholder={t("forms.builder.notifyPlaceholder")}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* Active toggle */}
          {formId && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("forms.builder.statusTitle")}</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isPending}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("forms.builder.activeLabel")}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("forms.builder.activeHint")}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Delete */}
          {formId && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-rose-800 mb-1">{t("forms.builder.dangerTitle")}</h3>
              <p className="text-xs text-rose-600 mb-4">
                {t("forms.builder.dangerHint")}
              </p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-medium text-rose-600 border border-rose-300 rounded-lg px-3 py-1.5 hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                {t("forms.builder.delete")}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Field {
  id: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface Props {
  slug: string;
  title: string;
  description?: string;
  fields: Field[];
  successMessage: string;
  redirectUrl?: string;
}

export function PublicFormRenderer({
  slug,
  title,
  description,
  fields,
  successMessage,
  redirectUrl,
}: Props) {
  const { t } = useTranslation("marketing");
  const [values, setValues] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/forms/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, _hp: honeypot }),
        });

        const data = await res.json();

        if (!data.ok) {
          setError(data.error || t("publicForm.genericError"));
          return;
        }

        setSubmitted(true);

        if (data.redirectUrl) {
          setTimeout(() => {
            window.location.href = data.redirectUrl;
          }, 2000);
        }
      } catch {
        setError(t("publicForm.networkError"));
      }
    });
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <p className="text-lg font-semibold text-slate-900 mb-2">{successMessage}</p>
        {redirectUrl && (
          <p className="text-sm text-slate-400 mt-4">{t("publicForm.redirecting")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-8 pb-6 border-b border-slate-100">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-5">
        {/* Honeypot — hidden from humans, bots tend to fill it. Submissions with
            this field set are silently dropped server-side. */}
        <input
          type="text"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {field.label}
              {field.required && <span className="text-rose-500 ml-1">*</span>}
            </label>

            {field.type === "textarea" ? (
              <textarea
                value={values[field.id] ?? ""}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                rows={4}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            ) : field.type === "select" ? (
              <select
                value={values[field.id] ?? ""}
                onChange={(e) => handleChange(field.id, e.target.value)}
                required={field.required}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t("publicForm.select")}</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={values[field.id] === "true"}
                  onChange={(e) => handleChange(field.id, String(e.target.checked))}
                  required={field.required}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">{field.placeholder}</span>
              </label>
            ) : (
              <input
                type={field.type === "phone" ? "tel" : field.type}
                value={values[field.id] ?? ""}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 mt-2"
        >
          {isPending ? t("common:status.submitting") : t("publicForm.submit")}
        </button>
      </form>
    </div>
  );
}

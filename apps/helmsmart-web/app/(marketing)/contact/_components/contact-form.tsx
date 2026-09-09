"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";
import { submitContactForm } from "@/lib/actions/contact";
import type { ContactState } from "@/lib/actions/contact";

// The value is what the form posts; the label is a key into
// `site.contact.form.subject.options`.
const SUBJECTS = ["general", "sales", "support", "billing", "other"];

export default function ContactFormComponent() {
  const { t } = useTranslation("site");
  const [state, action, isPending] = useActionState<ContactState, FormData>(
    submitContactForm,
    {}
  );

  const isSuccess = state?.success;
  const error = state?.error;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            {t("contact.form.name.label")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            disabled={isPending || isSuccess}
            placeholder={t("contact.form.name.placeholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {t("contact.form.email.label")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending || isSuccess}
            placeholder={t("contact.form.email.placeholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
          {t("contact.form.subject.label")}
        </label>
        <select
          id="subject"
          name="subject"
          required
          disabled={isPending || isSuccess}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">{t("contact.form.subject.options.placeholder")}</option>
          {SUBJECTS.map((value) => (
            <option key={value} value={value}>
              {t(`contact.form.subject.options.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
          {t("contact.form.message.label")}
        </label>
        <textarea
          id="message"
          name="body"
          rows={5}
          required
          disabled={isPending || isSuccess}
          placeholder={t("contact.form.message.placeholder")}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500 resize-none"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700" role="alert">{error}</p>
        </div>
      )}

      {isSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <p className="text-sm text-emerald-700 font-medium">
            {t("contact.form.success")}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isSuccess}
        className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white
                   hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40
                   disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending
          ? t("contact.form.submitting")
          : isSuccess
            ? t("contact.form.sent")
            : t("contact.form.submit")}
      </button>
    </form>
  );
}

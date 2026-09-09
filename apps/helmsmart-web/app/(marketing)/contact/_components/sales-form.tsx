"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";
import { submitSalesForm } from "@/lib/actions/sales";
import type { SalesState } from "@/lib/actions/sales";

// The id is what the form posts and what the sales notification lists; the
// label is a key into `site.sales.form.interest.options`.
const interestOptions = [
  "voice",
  "outbound",
  "ai-assistant",
  "inbox",
  "invoicing",
  "calendar",
  "crm",
  "all",
];

// Option value (posted) → label key under `site.sales.form.<field>.options`.
const teamSizes = [
  { value: "1", key: "solo" },
  { value: "2-5", key: "small" },
  { value: "6-10", key: "medium" },
  { value: "11-25", key: "large" },
  { value: "25+", key: "xlarge" },
];

const timelines = [
  { value: "asap", key: "asap" },
  { value: "q2", key: "q2" },
  { value: "q3", key: "q3" },
  { value: "exploring", key: "exploring" },
];

export default function SalesFormComponent() {
  const { t } = useTranslation("site");
  const [state, action, isPending] = useActionState<SalesState, FormData>(
    submitSalesForm,
    {}
  );

  const isSuccess = state?.success;
  const error = state?.error;

  return (
    <form action={action} className="space-y-6">
      {/* Name & Email */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            {t("sales.form.name.label")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            disabled={isPending || isSuccess}
            placeholder={t("sales.form.name.placeholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {t("sales.form.email.label")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending || isSuccess}
            placeholder={t("sales.form.email.placeholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      </div>

      {/* Company */}
      <div>
        <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">
          {t("sales.form.company.label")}
        </label>
        <input
          id="company"
          name="company"
          type="text"
          required
          disabled={isPending || isSuccess}
          placeholder={t("sales.form.company.placeholder")}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* What are you interested in? */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          {t("sales.form.interest.label")}
        </label>
        <div className="space-y-2">
          {interestOptions.map((id) => (
            <label key={id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="interested"
                value={id}
                disabled={isPending || isSuccess}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600
                           focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0
                           disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">
                {t(`sales.form.interest.options.${id}`)}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Team size & Timeline */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="teamSize" className="block text-sm font-medium text-gray-700 mb-1">
            {t("sales.form.teamSize.label")}
          </label>
          <select
            id="teamSize"
            name="teamSize"
            disabled={isPending || isSuccess}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">{t("sales.form.teamSize.options.placeholder")}</option>
            {teamSizes.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`sales.form.teamSize.options.${option.key}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="timeline" className="block text-sm font-medium text-gray-700 mb-1">
            {t("sales.form.timeline.label")}
          </label>
          <select
            id="timeline"
            name="timeline"
            disabled={isPending || isSuccess}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">{t("sales.form.timeline.options.placeholder")}</option>
            {timelines.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`sales.form.timeline.options.${option.key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
          {t("sales.form.message.label")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          disabled={isPending || isSuccess}
          placeholder={t("sales.form.message.placeholder")}
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
            {t("sales.form.success")}
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
          ? t("sales.form.submitting")
          : isSuccess
            ? t("sales.form.submitted")
            : t("sales.form.submit")}
      </button>

      <p className="text-xs text-gray-500 text-center">
        {t("sales.form.requiredNote")}
      </p>
    </form>
  );
}

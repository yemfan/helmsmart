"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";
import { createOrg } from "@/lib/actions/org";
import type { OrgState } from "@/lib/actions/org";

// The stored enum values. Their label and description live in
// `auth.onboarding.entityTypes.<value>` — the radio submits the value, the
// owner reads the translation.
const ENTITY_TYPES = [
  "sole_prop",
  "llc",
  "s_corp",
  "c_corp",
  "partnership",
  "nonprofit",
] as const;

// Suggestions for the category field. A datalist gives picklist convenience
// while still allowing free text ("Other") — the value drives topic prompts,
// which are written in the owner's own language, so the suggestion is
// translated along with everything else the owner reads.
const CATEGORY_KEYS = [
  "realEstate",
  "homeServices",
  "healthcare",
  "retail",
  "foodBeverage",
  "professionalServices",
  "fitnessWellness",
  "beautyPersonalCare",
  "automotive",
  "construction",
  "education",
  "technology",
  "nonprofit",
] as const;

export function OnboardingForm({ namePlaceholder }: { namePlaceholder?: string }) {
  const { t } = useTranslation("auth");
  const [state, action, isPending] = useActionState<OrgState, FormData>(
    createOrg,
    null
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      {/* Step header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">
            1
          </span>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {t("onboarding.step")}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t("onboarding.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("onboarding.subtitle")}
        </p>
      </div>

      <form action={action} className="space-y-6">
        {/* Business name */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("onboarding.name.label")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="organization"
            required
            disabled={isPending}
            maxLength={120}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-slate-50 disabled:text-slate-500"
            placeholder={namePlaceholder || t("onboarding.name.placeholder")}
          />
        </div>

        {/* Company website (optional) */}
        <div>
          <label
            htmlFor="website"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("onboarding.website.label")}{" "}
            <span className="font-normal text-slate-400">{t("onboarding.optional")}</span>
          </label>
          <input
            id="website"
            name="website"
            type="url"
            inputMode="url"
            autoComplete="url"
            disabled={isPending}
            maxLength={200}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-slate-50 disabled:text-slate-500"
            placeholder={t("onboarding.website.placeholder")}
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("onboarding.website.hint")}
          </p>
        </div>

        {/* Business category (picklist + free text via datalist) */}
        <div>
          <label
            htmlFor="business_category"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("onboarding.category.label")}{" "}
            <span className="font-normal text-slate-400">{t("onboarding.optional")}</span>
          </label>
          <input
            id="business_category"
            name="business_category"
            list="business-categories"
            type="text"
            autoComplete="off"
            disabled={isPending}
            maxLength={80}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-slate-50 disabled:text-slate-500"
            placeholder={t("onboarding.category.placeholder")}
          />
          <datalist id="business-categories">
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={t(`onboarding.categories.${c}`)} />
            ))}
          </datalist>
        </div>

        {/* Business location */}
        <div>
          <label
            htmlFor="business_location"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("onboarding.location.label")}{" "}
            <span className="font-normal text-slate-400">{t("onboarding.optional")}</span>
          </label>
          <input
            id="business_location"
            name="business_location"
            type="text"
            autoComplete="off"
            disabled={isPending}
            maxLength={120}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-slate-50 disabled:text-slate-500"
            placeholder={t("onboarding.location.placeholder")}
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("onboarding.location.hint")}
          </p>
        </div>

        {/* Business description */}
        <div>
          <label
            htmlFor="business_description"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("onboarding.description.label")}{" "}
            <span className="font-normal text-slate-400">{t("onboarding.optional")}</span>
          </label>
          <textarea
            id="business_description"
            name="business_description"
            rows={3}
            disabled={isPending}
            maxLength={600}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:bg-slate-50 disabled:text-slate-500 resize-none"
            placeholder={t("onboarding.description.placeholder")}
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("onboarding.description.hint")}
          </p>
        </div>

        {/* Entity type */}
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-3">
            {t("onboarding.structure.legend")}
          </legend>
          <div className="space-y-2">
            {ENTITY_TYPES.map((et) => (
              <label
                key={et}
                className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer
                           hover:border-indigo-300 hover:bg-indigo-50/50 has-[:checked]:border-indigo-500
                           has-[:checked]:bg-indigo-50 transition-colors"
              >
                <input
                  type="radio"
                  name="entity_type"
                  value={et}
                  disabled={isPending}
                  className="mt-0.5 accent-indigo-600"
                  required
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {t(`onboarding.entityTypes.${et}.label`)}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t(`onboarding.entityTypes.${et}.description`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Error */}
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white
                     hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                     disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? t("onboarding.submitting") : t("onboarding.submit")}
        </button>
      </form>

      <p className="mt-4 text-xs text-center text-slate-400">
        {t("onboarding.footnote")}
      </p>
    </div>
  );
}

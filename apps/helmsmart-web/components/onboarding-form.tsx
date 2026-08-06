"use client";

import { useActionState } from "react";
import { createOrg } from "@/lib/actions/org";
import type { OrgState } from "@/lib/actions/org";

const ENTITY_TYPES = [
  {
    value: "sole_prop",
    label: "Sole Proprietor",
    description: "You run the business yourself with no formal structure.",
  },
  {
    value: "llc",
    label: "LLC",
    description: "Limited liability company — the most common small business choice.",
  },
  {
    value: "s_corp",
    label: "S Corporation",
    description: "Pass-through taxation with corporate liability protection.",
  },
  {
    value: "c_corp",
    label: "C Corporation",
    description: "Separate legal entity — common for funded startups.",
  },
  {
    value: "partnership",
    label: "Partnership",
    description: "Two or more owners sharing profits and liability.",
  },
  {
    value: "nonprofit",
    label: "Non-profit",
    description: "501(c) or other tax-exempt organization funded by donations and grants.",
  },
] as const;

// Suggestions for the category field. A datalist gives picklist convenience
// while still allowing free text ("Other") — the value drives topic prompts.
const CATEGORIES = [
  "Real Estate",
  "Home Services",
  "Healthcare",
  "Retail",
  "Food & Beverage",
  "Professional Services",
  "Fitness & Wellness",
  "Beauty & Personal Care",
  "Automotive",
  "Construction",
  "Education",
  "Technology",
  "Non-profit",
] as const;

export function OnboardingForm({ namePlaceholder }: { namePlaceholder?: string }) {
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
            Setup · Step 1 of 1
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Tell us about your business</h1>
        <p className="mt-1 text-sm text-slate-500">
          We&apos;ll set up your chart of accounts automatically based on your business type.
        </p>
      </div>

      <form action={action} className="space-y-6">
        {/* Business name */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Business name
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
            placeholder={namePlaceholder || "Acme Plumbing LLC"}
          />
        </div>

        {/* Company website (optional) */}
        <div>
          <label
            htmlFor="website"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Company website{" "}
            <span className="font-normal text-slate-400">(optional)</span>
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
            placeholder="https://acme.com"
          />
          <p className="mt-1 text-xs text-slate-400">
            We&apos;ll use it to tailor your AI marketing and content.
          </p>
        </div>

        {/* Business category (picklist + free text via datalist) */}
        <div>
          <label
            htmlFor="business_category"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            What does your business do?{" "}
            <span className="font-normal text-slate-400">(optional)</span>
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
            placeholder="Pick one or type your own…"
          />
          <datalist id="business-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Business location */}
        <div>
          <label
            htmlFor="business_location"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Where are you based?{" "}
            <span className="font-normal text-slate-400">(optional)</span>
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
            placeholder="City, State (e.g. Austin, TX)"
          />
          <p className="mt-1 text-xs text-slate-400">
            Lets your AI write local-market content for your area.
          </p>
        </div>

        {/* Business description */}
        <div>
          <label
            htmlFor="business_description"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Describe your business{" "}
            <span className="font-normal text-slate-400">(optional)</span>
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
            placeholder="What you offer, who you serve, and what makes you different — a couple of sentences is plenty."
          />
          <p className="mt-1 text-xs text-slate-400">
            The more you share, the better your AI-generated posts and topics.
          </p>
        </div>

        {/* Entity type */}
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-3">
            Business structure
          </legend>
          <div className="space-y-2">
            {ENTITY_TYPES.map((et) => (
              <label
                key={et.value}
                className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer
                           hover:border-indigo-300 hover:bg-indigo-50/50 has-[:checked]:border-indigo-500
                           has-[:checked]:bg-indigo-50 transition-colors"
              >
                <input
                  type="radio"
                  name="entity_type"
                  value={et.value}
                  disabled={isPending}
                  className="mt-0.5 accent-indigo-600"
                  required
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {et.label}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {et.description}
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
          {isPending ? "Setting up your workspace…" : "Create my workspace →"}
        </button>
      </form>

      <p className="mt-4 text-xs text-center text-slate-400">
        Your chart of accounts will be pre-populated — you can customize it later.
      </p>
    </div>
  );
}

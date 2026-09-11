"use client";

import { useActionState, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createClient_ } from "@/lib/actions/clients";
import type { ClientState } from "@/lib/actions/clients";
import { CONTACT_LANGUAGES, CONTACT_LANGUAGE_NAMES, contactLanguageFor } from "@/lib/i18n/contactLocale";

// The values are what the database stores; only the labels are copy.
const STATUS_VALUES = ["lead", "prospect", "active", "inactive"] as const;

export function AddClientModal() {
  const { t, i18n } = useTranslation("clients");
  // A new client starts in the owner's own language when that isn't English —
  // a Spanish-speaking owner's clients mostly are too. Otherwise it starts on
  // "detect from their messages", which is what an empty value has always meant.
  const ownerLanguage = contactLanguageFor(i18n.language);
  const defaultLanguage = ownerLanguage === "en" ? "" : ownerLanguage;
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState<ClientState, FormData>(
    createClient_,
    null
  );

  // Auto-close on success
  if (state?.success && open) setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        {t("form.openAddButton")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">{t("form.addTitle")}</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={action} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t("form.firstName")} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="first_name"
                    type="text"
                    required
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder={t("form.placeholders.firstName")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.lastName")}</label>
                  <input
                    name="last_name"
                    type="text"
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder={t("form.placeholders.lastName")}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.company")}</label>
                <input
                  name="company"
                  type="text"
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder={t("form.placeholders.company")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.email")}</label>
                  <input
                    name="email"
                    type="email"
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder={t("form.placeholders.email")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.phone")}</label>
                  <input
                    name="phone"
                    type="tel"
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder={t("form.placeholders.phone")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.status")}</label>
                  <select
                    name="status"
                    defaultValue="lead"
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  >
                    {STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>{t(`form.statusOptions.${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.source")}</label>
                  <input
                    name="source"
                    type="text"
                    disabled={isPending}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder={t("form.placeholders.source")}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.language")}</label>
                <select
                  name="preferred_language"
                  defaultValue={defaultLanguage}
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                >
                  <option value="">{t("form.languageOptions.auto")}</option>
                  {CONTACT_LANGUAGES.map((l) => (
                    <option key={l} value={l}>{CONTACT_LANGUAGE_NAMES[l]}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">{t("form.languageHint")}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("form.tags")} <span className="text-slate-400 font-normal">{t("form.tagsHint")}</span>
                </label>
                <input
                  name="tags"
                  type="text"
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder={t("form.placeholders.tags")}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t("form.notes")}</label>
                <textarea
                  name="notes"
                  rows={2}
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 resize-none"
                  placeholder={t("form.placeholders.notes")}
                />
              </div>

              {state?.error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {state.error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60"
                >
                  {t("form.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {isPending ? t("common:status.saving") : t("form.addButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

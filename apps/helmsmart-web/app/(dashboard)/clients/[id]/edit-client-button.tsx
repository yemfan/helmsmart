"use client";

import { useState } from "react";
import { X, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClientEditForm } from "./client-edit-form";

interface Props {
  clientId: string;
  initialValues: {
    first_name: string;
    last_name: string;
    company: string;
    email: string;
    phone: string;
    status: string;
    source: string;
    notes: string;
    tags: string;
  };
}

/**
 * Header "Edit" button that opens the client edit form in a modal. The same
 * form also lives in the right sidebar, but it's easy to miss (and gets hidden
 * behind the AI panel on narrower screens), so this surfaces it prominently.
 */
export function EditClientButton({ clientId, initialValues }: Props) {
  const { t } = useTranslation("clients");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" /> {t("detail.actions.edit")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">{t("form.editTitle")}</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ClientEditForm clientId={clientId} initialValues={initialValues} />
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rocket, X, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createProjectFromTemplate } from "@/lib/actions/project-templates";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface Props {
  templateId: string;
  templateName: string;
  clients: Client[];
}

export function UseTemplateButton({ templateId, templateName, clients }: Props) {
  const { t } = useTranslation("projects");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(templateName);
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientLabel = (c: Client): string =>
    [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || t("timesheets.clientFallback");

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createProjectFromTemplate(templateId, {
        name: name.trim() || templateName,
        clientId: clientId || undefined,
        startDate,
      });
      if (!result.ok) {
        setError(result.error ?? t("templates.use.createFailed"));
      } else {
        router.push(`/projects/${result.projectId}`);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => { setName(templateName); setOpen(true); }}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
      >
        <Rocket className="w-3.5 h-3.5" />
        {t("templates.use.trigger")}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">{t("templates.use.title")}</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.use.projectName")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.use.client")}</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                >
                  <option value="">{t("templates.use.noClient")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{clientLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.use.startDate")}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isPending}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            </div>

            <p className="text-xs text-slate-400">
              {t("templates.use.hint")}
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Rocket className="w-3.5 h-3.5" />
                {isPending ? t("common:status.creating") : t("templates.use.submit")}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

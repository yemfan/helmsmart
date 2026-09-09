"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createProjectTemplate,
  updateProjectTemplate,
  type TemplateTask,
} from "@/lib/actions/project-templates";

const COLORS = [
  { value: "indigo",  dot: "bg-indigo-500" },
  { value: "emerald", dot: "bg-emerald-500" },
  { value: "rose",    dot: "bg-rose-500" },
  { value: "amber",   dot: "bg-amber-500" },
  { value: "violet",  dot: "bg-violet-500" },
  { value: "slate",   dot: "bg-slate-400" },
] as const;

const PRIORITY_OPTS = ["urgent", "high", "normal", "low"] as const;

interface Props {
  templateId?: string;
  initialValues?: {
    name: string;
    description: string;
    color: string;
    budgetHours: string;
    hourlyRate: string;
    defaultDurationDays: string;
    defaultTasks: Array<{ title: string; priority: string; offset_days?: number }>;
  };
}

export function ProjectTemplateEditor({ templateId, initialValues }: Props) {
  const { t } = useTranslation("projects");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName]             = useState(initialValues?.name ?? "");
  const [description, setDesc]      = useState(initialValues?.description ?? "");
  const [color, setColor]           = useState(initialValues?.color ?? "indigo");
  const [budgetHours, setBudget]    = useState(initialValues?.budgetHours ?? "");
  const [hourlyRate, setRate]       = useState(initialValues?.hourlyRate ?? "");
  const [duration, setDuration]     = useState(initialValues?.defaultDurationDays ?? "");
  const [tasks, setTasks]           = useState<Array<{ title: string; priority: string; offset_days: string }>>(
    (initialValues?.defaultTasks ?? []).map((task) => ({
      title: task.title,
      priority: task.priority,
      offset_days: task.offset_days != null ? String(task.offset_days) : "",
    }))
  );

  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const addTask = () => setTasks((prev) => [...prev, { title: "", priority: "normal", offset_days: "" }]);
  const removeTask = (i: number) => setTasks((prev) => prev.filter((_, idx) => idx !== i));
  const updateTask = (i: number, field: string, value: string) =>
    setTasks((prev) => prev.map((task, idx) => (idx === i ? { ...task, [field]: value } : task)));

  const handleSave = () => {
    if (!name.trim()) { setError(t("templates.editor.nameRequired")); return; }
    setError(null);
    setSaved(false);

    const mappedTasks: TemplateTask[] = tasks
      .filter((task) => task.title.trim())
      .map((task) => ({
        title: task.title.trim(),
        priority: task.priority as TemplateTask["priority"],
        offset_days: task.offset_days ? parseInt(task.offset_days, 10) : undefined,
      }));

    startTransition(async () => {
      if (templateId) {
        const result = await updateProjectTemplate(templateId, {
          name: name.trim(),
          description: description.trim(),
          color,
          budgetHours: budgetHours ? parseFloat(budgetHours) : null,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
          defaultDurationDays: duration ? parseInt(duration, 10) : null,
          defaultTasks: mappedTasks,
        });
        if (!result.ok) { setError(result.error ?? t("templates.editor.saveFailed")); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const result = await createProjectTemplate({
          name: name.trim(),
          description: description.trim(),
          color,
          budgetHours: budgetHours ? parseFloat(budgetHours) : undefined,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          defaultDurationDays: duration ? parseInt(duration, 10) : undefined,
          defaultTasks: mappedTasks,
        });
        if (!result.ok) { setError(result.error ?? t("templates.editor.createFailed")); return; }
        router.push("/projects/templates");
      }
    });
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/projects/templates" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 flex-1">
          {templateId ? t("templates.editor.editTitle") : t("templates.editor.newTitle")}
        </h1>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> {t("templates.editor.saved")}</> : isPending ? t("common:status.saving") : t("templates.editor.save")}
        </button>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">{t("templates.editor.details")}</h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.editor.nameLabel")}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              disabled={isPending} placeholder={t("templates.editor.namePlaceholder")}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.editor.description")}</label>
            <textarea value={description} onChange={(e) => setDesc(e.target.value)}
              disabled={isPending} placeholder={t("templates.editor.descriptionPlaceholder")}
              rows={2} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-60" />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">{t("templates.editor.color")}</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full ${c.dot} transition-transform ${color === c.value ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-105"}`} />
              ))}
            </div>
          </div>

          {/* Budget fields */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.editor.budgetHours")}</label>
              <input type="number" value={budgetHours} onChange={(e) => setBudget(e.target.value)}
                disabled={isPending} placeholder="40" min="0"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.editor.hourlyRate")}</label>
              <input type="number" value={hourlyRate} onChange={(e) => setRate(e.target.value)}
                disabled={isPending} placeholder="150" min="0"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("templates.editor.duration")}</label>
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)}
                disabled={isPending} placeholder="30" min="1"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
            </div>
          </div>
        </div>

        {/* Default tasks */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">{t("templates.editor.defaultTasks")}</h2>
            <button type="button" onClick={addTask} disabled={isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />
              {t("templates.editor.addTask")}
            </button>
          </div>

          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              {t("templates.editor.noTasks")}
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <input type="text" value={task.title}
                        onChange={(e) => updateTask(i, "title", e.target.value)}
                        disabled={isPending} placeholder={t("templates.editor.taskTitlePlaceholder")}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={task.priority}
                        onChange={(e) => updateTask(i, "priority", e.target.value)}
                        disabled={isPending}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 bg-white">
                        {PRIORITY_OPTS.map((p) => (
                          <option key={p} value={p}>{t(`priority.${p}`)}</option>
                        ))}
                      </select>
                      <input type="number" value={task.offset_days}
                        onChange={(e) => updateTask(i, "offset_days", e.target.value)}
                        disabled={isPending} placeholder={t("templates.editor.dayPlaceholder")} min="0" title={t("templates.editor.dayTitle")}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 text-center" />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeTask(i)} disabled={isPending}
                    aria-label={t("common:actions.delete")}
                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-slate-400 mt-2">
                {t("templates.editor.dayNote")}
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createProjectTemplate, type TemplateTask } from "@/lib/actions/project-templates";

interface StarterTemplate {
  name: string;
  description: string;
  color: string;
  budget_hours: number;
  default_duration_days: number;
  default_tasks: readonly { title: string; priority: string; offset_days: number }[];
}

export function ImportStarterButton({ template }: { template: StarterTemplate }) {
  const { t } = useTranslation("projects");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleImport = () => {
    startTransition(async () => {
      await createProjectTemplate({
        name: template.name,
        description: template.description,
        color: template.color,
        budgetHours: template.budget_hours,
        defaultDurationDays: template.default_duration_days,
        defaultTasks: template.default_tasks.map((task) => ({
          title: task.title,
          priority: task.priority as TemplateTask["priority"],
          offset_days: task.offset_days,
        })),
      });
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleImport}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors disabled:opacity-50"
    >
      <Plus className="w-3.5 h-3.5" />
      {isPending ? t("common:status.adding") : t("templates.import")}
    </button>
  );
}

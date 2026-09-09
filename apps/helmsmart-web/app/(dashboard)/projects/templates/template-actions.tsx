"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { deleteProjectTemplate } from "@/lib/actions/project-templates";

export function ProjectTemplateActions({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const { t } = useTranslation("projects");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm(t("templates.confirmDelete", { name: templateName }))) return;
    startTransition(async () => {
      await deleteProjectTemplate(templateId);
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      title={t("templates.deleteTitle")}
      className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

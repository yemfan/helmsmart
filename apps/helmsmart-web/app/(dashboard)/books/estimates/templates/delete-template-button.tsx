"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { deleteEstimateTemplate } from "@/lib/actions/estimate-templates";

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation("books");
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleDelete() {
    if (!confirm(t("estimates.templates.confirmDelete", { name }))) return;
    start(async () => {
      await deleteEstimateTemplate(id);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      title={t("estimates.templates.deleteTitle")}
      className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-40 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

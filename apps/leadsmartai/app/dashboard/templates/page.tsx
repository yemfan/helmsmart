import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { LayoutTemplate } from "lucide-react";
import TemplatePickerClient from "@/components/dashboard/TemplatePickerClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.templates.metaTitle", { ns: "dashboard" }),
    description: t("pages.templates.metaDescription", { ns: "dashboard" }),
    keywords: ["templates", "sms", "email", "messaging"],
    robots: { index: false },
  };
}

export default async function TemplatesPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/15">
          <LayoutTemplate className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("pages.templates.heading", { ns: "dashboard" })}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("pages.templates.intro", { ns: "dashboard" })}
          </p>
        </div>
      </div>

      <TemplatePickerClient />
    </div>
  );
}

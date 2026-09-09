import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportForm } from "./import-form";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("clients");
  return { title: t("meta.importTitle") };
}

export default async function ImportClientsPage() {
  const t = await getServerT("clients");
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("import.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("import.subtitle")}
          </p>
        </div>
        <Link
          href="/clients"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("import.back")}
        </Link>
      </div>

      <ImportForm />
    </div>
  );
}

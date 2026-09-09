import type { Metadata } from "next";
import Link from "next/link";
import { Plus, FileInput, ExternalLink, Users } from "lucide-react";
import { listForms } from "@/lib/actions/forms";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.forms") };
}

export default async function FormsPage() {
  const [forms, t] = await Promise.all([listForms(), getServerT("marketing")]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("forms.list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("forms.list.subtitle")}
          </p>
        </div>
        <Link
          href="/forms/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("forms.list.new")}
        </Link>
      </div>

      {forms.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <FileInput className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">{t("forms.list.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mt-1 mb-6 max-w-sm mx-auto">
            {t("forms.list.emptyBody")}
          </p>
          <Link
            href="/forms/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("forms.list.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {forms.map((form) => {
            const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/f/${form.slug}`;
            return (
              <div
                key={form.id}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/forms/${form.id}`}
                        className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {form.title}
                      </Link>
                      {!form.is_active && (
                        <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                          {t("forms.list.inactive")}
                        </span>
                      )}
                    </div>
                    {form.description && (
                      <p className="text-sm text-slate-500 mt-1 truncate">{form.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span>{t("forms.list.fields", { count: (form.fields as unknown[]).length })}</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {t("forms.list.submissionCount", { count: form.submission_count ?? 0 })}
                      </span>
                      <span>
                        /{form.slug}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <a
                      href={`/f/${form.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t("forms.list.preview")}
                    </a>
                    <Link
                      href={`/forms/${form.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-indigo-200 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors"
                    >
                      {t("forms.list.edit")}
                    </Link>
                    <Link
                      href={`/forms/${form.id}/submissions`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {t("forms.list.submissions")}
                    </Link>
                  </div>
                </div>

                {/* Embed code snippet */}
                <div className="mt-4 bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
                    {t("forms.list.embedLink")}
                  </p>
                  <p className="text-xs font-mono text-slate-600 truncate">
                    {publicUrl}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

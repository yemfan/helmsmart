import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, ExternalLink } from "lucide-react";
import { getForm, getFormSubmissions } from "@/lib/actions/forms";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.submissions") };
}

export default async function FormSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [form, submissions, t, locale] = await Promise.all([
    getForm(id),
    getFormSubmissions(id),
    getServerT("marketing"),
    getServerLocale(),
  ]);

  if (!form) notFound();

  const fields = form.fields;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href={`/forms/${id}`}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{form.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("forms.submissions.count", { count: submissions.length })}
          </p>
        </div>
        <a
          href={`/f/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t("forms.submissions.viewForm")}
        </a>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">{t("forms.submissions.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mt-1">
            {t("forms.submissions.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t("forms.submissions.date")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t("forms.submissions.name")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t("forms.submissions.email")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t("forms.submissions.phone")}
                  </th>
                  {/* Dynamic field columns (up to 3 extra) */}
                  {fields
                    .filter(
                      (f) =>
                        !["email", "phone"].includes(f.type) &&
                        !f.label.toLowerCase().includes("name")
                    )
                    .slice(0, 3)
                    .map((f) => (
                      <th
                        key={f.id}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                      >
                        {f.label}
                      </th>
                    ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t("forms.submissions.lead")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {submissions.map((sub) => {
                  const data = (sub.data ?? {}) as Record<string, string>;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(sub.created_at).toLocaleDateString(intlLocale(locale), {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {sub.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{sub.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                        {sub.phone || "—"}
                      </td>
                      {fields
                        .filter(
                          (f) =>
                            !["email", "phone"].includes(f.type) &&
                            !f.label.toLowerCase().includes("name")
                        )
                        .slice(0, 3)
                        .map((f) => (
                          <td key={f.id} className="px-4 py-3 text-slate-600 max-w-xs truncate">
                            {data[f.id] || "—"}
                          </td>
                        ))}
                      <td className="px-4 py-3">
                        {sub.client_id ? (
                          <Link
                            href={`/clients/${sub.client_id}`}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            {t("forms.submissions.view")}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

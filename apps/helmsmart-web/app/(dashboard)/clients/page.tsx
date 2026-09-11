import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Users, Mail, Phone, Building2, Download, Upload, Tag } from "lucide-react";
import { AddClientModal } from "@/components/add-client-modal";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("clients");
  return { title: t("meta.listTitle") };
}

const STATUS_COLORS: Record<string, string> = {
  lead:     "bg-slate-100 text-slate-600",
  prospect: "bg-blue-100 text-blue-700",
  active:   "bg-emerald-100 text-emerald-700",
  inactive: "bg-amber-100 text-amber-700",
  archived: "bg-red-100 text-red-700",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tag?: string }>;
}) {
  const [t, locale] = await Promise.all([getServerT("clients"), getServerLocale()]);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "";
  const tagFilter = params.tag ?? "";

  const buildHref = (o: { q?: string; status?: string; tag?: string }) => {
    const sp = new URLSearchParams();
    if (o.q) sp.set("q", o.q);
    if (o.status) sp.set("status", o.status);
    if (o.tag) sp.set("tag", o.tag);
    const qs = sp.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  let dbQuery = supabase
    .from("clients")
    .select("id, first_name, last_name, company, email, phone, status, tags, lifetime_value, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (statusFilter) dbQuery = dbQuery.eq("status", statusFilter);
  if (tagFilter) dbQuery = dbQuery.contains("tags", [tagFilter]);
  if (query) {
    dbQuery = dbQuery.or(
      `first_name.ilike.%${query}%,last_name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`
    );
  }

  const { data: clients } = await dbQuery.limit(100);

  // Status + tag counts (across all clients in the org)
  const { data: allRows } = await supabase
    .from("clients")
    .select("status, tags")
    .eq("organization_id", orgId);

  const counts = (allRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const tagCounts: Record<string, number> = {};
  for (const r of allRows ?? []) {
    for (const t of ((r.tags as string[] | null) ?? [])) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }
  const allTags = Object.keys(tagCounts).sort();

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <PageTitle base="Clients" />
          <p className="text-sm text-slate-500 mt-0.5">
            {[
              t("list.summaryActive", { count: counts.active ?? 0 }),
              t("list.summaryLeads", { count: counts.lead ?? 0 }),
              t("list.summaryProspects", { count: counts.prospect ?? 0 }),
            ].join(" · ")}
          </p>
        </div>
        <Link
          href="/clients/import"
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Upload className="w-4 h-4" />
          {t("list.import")}
        </Link>
        <Link
          href="/api/export/clients"
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {t("list.export")}
        </Link>
        <AddClientModal />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <form method="GET" className="flex-1 min-w-[200px] max-w-sm">
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t("list.searchPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
        </form>

        <div className="flex flex-wrap gap-1">
          {(["", "lead", "prospect", "active", "inactive"] as const).map((s) => (
            <a
              key={s}
              href={buildHref({ q: query, status: s, tag: tagFilter })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(`statuses.${s || "all"}`)}
            </a>
          ))}
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
            <Tag className="w-3 h-3" /> {t("list.tags")}
          </span>
          {tagFilter && (
            <a
              href={buildHref({ q: query, status: statusFilter })}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              {t("list.clearTag")}
            </a>
          )}
          {allTags.map((t) => (
            <a
              key={t}
              href={buildHref({ q: query, status: statusFilter, tag: tagFilter === t ? undefined : t })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                tagFilter === t ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
              }`}
            >
              {t} <span className="opacity-60">{tagCounts[t]}</span>
            </a>
          ))}
        </div>
      )}

      {/* Client list */}
      {!clients?.length ? (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">
            {query || statusFilter || tagFilter
              ? t("list.empty.titleFiltered")
              : t("list.empty.title")}
          </p>
          <p className="text-xs text-slate-400 max-w-xs">
            {query || statusFilter || tagFilter
              ? t("list.empty.hintFiltered")
              : t("list.empty.hint")}
          </p>
          {!query && !statusFilter && !tagFilter && (
            <div className="mt-5">
              <AddClientModal />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>{t("list.columns.name")}</span>
            <span>{t("list.columns.contact")}</span>
            <span>{t("list.columns.status")}</span>
            <span className="text-right">{t("list.columns.lifetime")}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {clients.map((client) => {
              const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ");
              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors"
                >
                  {/* Name / company / tags */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{fullName}</p>
                    {client.company && (
                      <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {client.company}
                      </p>
                    )}
                    {client.tags?.length ? (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(client.tags as string[]).map((tag) => (
                          <span key={tag} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600 font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Contact */}
                  <div className="min-w-0 space-y-0.5">
                    {client.email && (
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        {client.email}
                      </p>
                    )}
                    {client.phone && (
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        {client.phone}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[client.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {t(`statuses.${client.status}`, { defaultValue: client.status })}
                    </span>
                  </div>

                  {/* Lifetime value */}
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-700 tabular-nums">
                      {(client.lifetime_value ?? 0) > 0
                        ? new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(client.lifetime_value)
                        : "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

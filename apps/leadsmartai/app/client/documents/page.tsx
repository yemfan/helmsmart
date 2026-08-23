"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClientLeadId } from "@/components/client/useClientLeadId";

type MeRes = { ok: boolean; primaryLeadId?: string | null; leads?: { id: string; property_address: string | null }[] };
type Doc = { id: string; title: string; doc_type: string; url: string | null; created_at: string };

export default function ClientDocumentsPage() {
  const { t } = useTranslation("dashboard");
  const [me, setMe] = useState<MeRes | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId, setLeadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const load = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const m = (await r.json()) as MeRes;
    setMe(m);
  }, []);

  const loadDocs = useCallback(async () => {
    if (!leadId) {
      setDocs([]);
      return;
    }
    const j = await fetch(`/api/client/documents?leadId=${encodeURIComponent(leadId)}`, {
      credentials: "include",
    }).then((r) => r.json());
    setDocs(j.ok ? j.documents ?? [] : []);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("pages.clientPortal.documents")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("pages.clientPortal.documentsSub")}</p>
      </div>

      {leads.length > 1 && (
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value)}
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.property_address || `Deal ${l.id}`}
            </option>
          ))}
        </select>
      )}

      {!leadId && (
        <p className="text-sm text-slate-500">{t("pages.clientPortal.noDealSelected")}</p>
      )}

      <ul className="space-y-2">
        {docs.map((d) => (
          <li
            key={d.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3"
          >
            <div>
              <div className="font-semibold text-slate-900 text-sm">
                {t(`pages.clientPortal.docTypes.${d.doc_type}`, { defaultValue: d.title })}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 capitalize">{d.doc_type}</div>
            </div>
            {d.url ? (
              <Link
                href={d.url}
                className="shrink-0 text-xs font-bold text-blue-700"
                target={d.url.startsWith("http") ? "_blank" : undefined}
              >{t("pages.clientPortal.open")}</Link>
            ) : (
              <span className="text-xs text-slate-400">{t("pages.clientPortal.noLink")}</span>
            )}
          </li>
        ))}
      </ul>

      {leadId && docs.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-6">{t("pages.clientPortal.noDocuments")}</p>
      )}
    </div>
  );
}

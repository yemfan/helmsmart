"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, PhoneOutgoing, Users, CalendarClock, ClipboardList, Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { callLead, callAll } from "@/lib/actions/outbound";

type FollowUpContact = { id: string; name: string; phone: string | null; company: string | null; stage: string };
type ApptContact = { clientId: string; name: string; phone: string | null; startAt: string };
type Purpose = "follow_up" | "appointment_reminder" | "survey" | "promo";

/** The purpose value is what the outbound action stores; label + hint come from the bundle. */
const PURPOSES: { key: Purpose; icon: typeof Users }[] = [
  { key: "follow_up", icon: Users },
  { key: "appointment_reminder", icon: CalendarClock },
  { key: "survey", icon: ClipboardList },
  { key: "promo", icon: Megaphone },
];

export function OutboundCalls({
  followUp,
  appointments,
  hasNumber,
}: {
  followUp: FollowUpContact[];
  appointments: ApptContact[];
  hasNumber: boolean;
}) {
  const { t, i18n } = useTranslation("voice");
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [detail, setDetail] = useState("");
  const [, startTransition] = useTransition();

  const needsDetail = purpose === "survey" || purpose === "promo";
  const detailMissing = needsDetail && !detail.trim();

  function formatWhen(iso: string) {
    return new Date(iso).toLocaleString(intlLocale(i18n.language), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function call(clientId: string, name: string, phone: string | null) {
    if (!phone || pendingId) return;
    if (detailMissing) {
      setMsg({
        ok: false,
        text: purpose === "survey" ? t("outbound.surveyDetailRequired") : t("outbound.promoDetailRequired"),
      });
      return;
    }
    if (!window.confirm(t("outbound.confirmOne", { name, phone }))) return;
    setPendingId(clientId);
    setMsg(null);
    startTransition(async () => {
      const res = await callLead({ clientId, purpose, detail: needsDetail ? detail.trim() : undefined });
      setPendingId(null);
      setMsg(res.ok ? { ok: true, text: t("outbound.calling", { name: res.name }) } : { ok: false, text: res.error });
    });
  }

  const rows =
    purpose === "appointment_reminder"
      ? appointments.map((a) => ({ key: `${a.clientId}-${a.startAt}`, id: a.clientId, name: a.name, phone: a.phone, meta: formatWhen(a.startAt) }))
      : followUp.map((c) => ({ key: c.id, id: c.id, name: c.name, phone: c.phone, meta: c.company || "" }));

  function callEveryone() {
    const ids = Array.from(new Set(rows.map((r) => r.id)));
    if (!ids.length || bulkPending || pendingId) return;
    if (detailMissing) {
      setMsg({
        ok: false,
        text: purpose === "survey" ? t("outbound.surveyDetailRequired") : t("outbound.promoDetailRequired"),
      });
      return;
    }
    const n = Math.min(ids.length, 15);
    if (!window.confirm(t("outbound.confirmAll", { count: n }))) return;
    setBulkPending(true);
    setMsg(null);
    startTransition(async () => {
      const res = await callAll({ purpose, clientIds: ids, detail: needsDetail ? detail.trim() : undefined });
      setBulkPending(false);
      setMsg(
        res.ok
          ? { ok: true, text: t("outbound.queued", { count: res.queued }) }
          : { ok: false, text: res.error }
      );
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <PhoneOutgoing className="w-4 h-4 text-indigo-500" />
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t("outbound.title")}</h2>
          <p className="text-xs text-slate-400">{t("outbound.subtitle")}</p>
        </div>
      </div>

      {!hasNumber ? (
        <div className="px-6 py-8 text-center text-sm text-slate-500">
          <p>{t("outbound.noNumber")}</p>
          <a href="/settings#voice-agent" className="text-indigo-600 hover:underline">{t("outbound.noNumberLink")}</a>
        </div>
      ) : (
        <div className="p-6 space-y-4">
          {/* Purpose picker */}
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setPurpose(key); setMsg(null); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  purpose === key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title={t(`outbound.purposes.${key}.hint`)}
              >
                <Icon className="w-4 h-4" />
                {t(`outbound.purposes.${key}.label`)}
              </button>
            ))}
          </div>

          {/* Message / questions for survey + promo calls */}
          {needsDetail && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {purpose === "survey" ? t("outbound.surveyLabel") : t("outbound.promoLabel")}
              </label>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={2}
                placeholder={
                  purpose === "survey"
                    ? t("outbound.surveyPlaceholder")
                    : t("outbound.promoPlaceholder")
                }
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {t("outbound.detailHint")}
              </p>
            </div>
          )}

          {msg && (
            <div
              role={msg.ok ? undefined : "alert"}
              className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}
            >
              {msg.ok ? "📞 " : ""}{msg.text}
            </div>
          )}

          {/* Call all */}
          {rows.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t("outbound.contacts", { count: rows.length })}</span>
              <button
                onClick={callEveryone}
                disabled={bulkPending || pendingId !== null}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                {bulkPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOutgoing className="w-3.5 h-3.5" />}
                {rows.length > 15
                  ? t("outbound.callAllCapped", { count: 15 })
                  : t("outbound.callAll", { count: rows.length })}
              </button>
            </div>
          )}

          {/* Contact list */}
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              {purpose === "appointment_reminder"
                ? t("outbound.emptyAppointments")
                : t("outbound.emptyContacts")}
            </div>
          ) : (
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.name || t("outbound.unnamed")}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.phone || t("outbound.noPhone")}{r.meta ? ` · ${r.meta}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => call(r.id, r.name || t("outbound.thisContact"), r.phone)}
                    disabled={!r.phone || pendingId !== null || bulkPending}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {pendingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                    {t("outbound.aiCall")}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            {t("outbound.disclosure")}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import {
  X, Mail, Phone, ChevronRight,
  Users, Edit2, Check, Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import type { PipelineStage, PipelineClient } from "./page";
import { patchClient } from "@/lib/actions/clients";
import { letSarahFollowUp } from "@/lib/actions/approvals";

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES: { key: PipelineStage; color: string; bg: string; border: string }[] = [
  { key: "lead",        color: "text-slate-600",  bg: "bg-slate-100",   border: "border-slate-200" },
  { key: "qualified",   color: "text-blue-700",   bg: "bg-blue-50",     border: "border-blue-200" },
  { key: "proposal",    color: "text-violet-700", bg: "bg-violet-50",   border: "border-violet-200" },
  { key: "negotiation", color: "text-amber-700",  bg: "bg-amber-50",    border: "border-amber-200" },
  { key: "won",         color: "text-emerald-700",bg: "bg-emerald-50",  border: "border-emerald-200" },
  { key: "lost",        color: "text-rose-600",   bg: "bg-rose-50",     border: "border-rose-200" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function money(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function daysInStage(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ─── Client card ──────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  client: PipelineClient;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, clientId: string) => void;
  onDragEnd: () => void;
}) {
  const { t, i18n } = useTranslation("pipeline");
  const locale = intlLocale(i18n.language);
  const days = daysInStage(client.stage_changed_at);
  const value = client.expected_value ?? client.lifetime_value;
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || t("card.unnamed");

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, client.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all select-none group active:opacity-70"
    >
      {/* Name + value */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
            {name}
          </p>
          {client.company && [client.first_name, client.last_name].some(Boolean) && (
            <p className="text-xs text-slate-400 truncate">{client.company}</p>
          )}
        </div>
        {value ? (
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
            {money(value, locale)}
          </span>
        ) : null}
      </div>

      {/* Contact row */}
      <div className="flex items-center gap-3 mt-3">
        {client.email && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{client.email}</span>
          </span>
        )}
        {client.phone && !client.email && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Phone className="w-3 h-3 flex-shrink-0" />
            {client.phone}
          </span>
        )}
      </div>

      {/* Days in stage */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-400">
          {days === 0 ? t("card.today") : t("card.daysInStage", { count: days })}
        </span>
        {client.pipeline_note && (
          <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
            {client.pipeline_note}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  client,
  onClose,
  onUpdate,
}: {
  client: PipelineClient;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<PipelineClient>) => void;
}) {
  const { t } = useTranslation("pipeline");
  const [note, setNote] = useState(client.pipeline_note ?? "");
  const [value, setValue] = useState(client.expected_value?.toString() ?? "");
  const [editNote, setEditNote] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sarahStatus, setSarahStatus] = useState<"idle" | "queued" | "no_phone" | "error">("idle");

  const name = [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || t("card.unnamed");

  function askSarah() {
    startTransition(async () => {
      const res = await letSarahFollowUp(client.id);
      setSarahStatus(res.status === "queued" ? "queued" : res.status === "no_phone" ? "no_phone" : "error");
    });
  }

  function saveNote() {
    startTransition(async () => {
      await patchClient(client.id, { pipeline_note: note || null });
      onUpdate(client.id, { pipeline_note: note || null });
      setEditNote(false);
    });
  }

  function saveValue() {
    const num = value ? parseFloat(value) : null;
    startTransition(async () => {
      await patchClient(client.id, { expected_value: num });
      onUpdate(client.id, { expected_value: num });
    });
  }

  function moveStage(stage: PipelineStage) {
    startTransition(async () => {
      await patchClient(client.id, { pipeline_stage: stage });
      onUpdate(client.id, { pipeline_stage: stage, stage_changed_at: new Date().toISOString() });
      onClose();
    });
  }

  const stage = STAGES.find((s) => s.key === client.pipeline_stage)!;
  const days = daysInStage(client.stage_changed_at);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-end" onClick={onClose}>
      <div
        className="w-full sm:w-96 bg-white h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto shadow-2xl sm:rounded-2xl sm:border sm:border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{name}</h2>
            {client.company && [client.first_name, client.last_name].some(Boolean) && (
              <p className="text-xs text-slate-500 mt-0.5">{client.company}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
          {/* Stage badge + days */}
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${stage.bg} ${stage.color}`}>
              {t(`stages.${stage.key}`)}
            </span>
            <span className="text-xs text-slate-400">
              {days === 0 ? t("detail.sinceToday") : t("detail.daysInStage", { count: days })}
            </span>
          </div>

          {/* Expected value */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("detail.expectedValue")}</label>
            <div className="relative flex items-center gap-2">
              <span className="absolute left-3 text-slate-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={saveValue}
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">{t("detail.note")}</label>
              {!editNote && (
                <button onClick={() => setEditNote(true)} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> {t("common:actions.edit")}
                </button>
              )}
            </div>
            {editNote ? (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t("detail.notePlaceholder")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveNote}
                    disabled={isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> {t("common:actions.save")}
                  </button>
                  <button onClick={() => { setNote(client.pipeline_note ?? ""); setEditNote(false); }} className="px-3 py-1.5 border border-slate-200 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50">
                    {t("common:actions.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {note || <span className="text-slate-400 italic">{t("detail.noNote")}</span>}
              </p>
            )}
          </div>

          {/* Contact info */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">{t("detail.contact")}</p>
            {client.email && (
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700">
                <Mail className="w-3.5 h-3.5" />
                {client.email}
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800">
                <Phone className="w-3.5 h-3.5" />
                {client.phone}
              </a>
            )}
          </div>

          {/* Move to stage */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">{t("detail.moveToStage")}</p>
            <div className="grid grid-cols-3 gap-2">
              {STAGES.filter((s) => s.key !== client.pipeline_stage).map((s) => (
                <button
                  key={s.key}
                  onClick={() => moveStage(s.key)}
                  disabled={isPending}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${s.bg} ${s.color} border ${s.border} hover:opacity-80 disabled:opacity-40`}
                >
                  {t(`stages.${s.key}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-3">
          {/* Sarah follow-up */}
          {client.phone && (
            <div>
              {sarahStatus === "queued" ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                  <Check className="w-3.5 h-3.5" /> {t("detail.sarah.queued")} — <a href="/tasks" className="underline">{t("detail.sarah.seeTasks")}</a>
                </p>
              ) : sarahStatus === "no_phone" ? (
                <p className="text-xs text-slate-400">{t("detail.sarah.noPhone")}</p>
              ) : sarahStatus === "error" ? (
                <p className="text-xs text-rose-500" role="alert">{t("common:errors.generic")}</p>
              ) : (
                <button
                  onClick={askSarah}
                  disabled={isPending}
                  className="flex items-center gap-1.5 w-full text-left px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                  {isPending ? t("detail.sarah.drafting") : t("detail.sarah.ask")}
                </button>
              )}
            </div>
          )}
          <Link
            href={`/clients/${client.id}`}
            className="flex items-center justify-between text-sm font-medium text-slate-700 hover:text-indigo-700 transition-colors group"
          >
            {t("detail.viewProfile")}
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Board column ─────────────────────────────────────────────────────────────

function BoardColumn({
  stage,
  clients,
  onCardClick,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  stage: (typeof STAGES)[number];
  clients: PipelineClient[];
  onCardClick: (c: PipelineClient) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (stage: PipelineStage) => void;
}) {
  const { t, i18n } = useTranslation("pipeline");
  const locale = intlLocale(i18n.language);
  const [dragOver, setDragOver] = useState(false);
  const total = clients.reduce((s, c) => s + (c.expected_value ?? 0), 0);

  return (
    <div
      className="flex flex-col min-w-[220px] w-[220px] flex-shrink-0"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(stage.key); }}
    >
      {/* Column header */}
      <div className={`mb-3 px-3 py-2 rounded-xl ${stage.bg} border ${stage.border}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold uppercase tracking-wide ${stage.color}`}>
            {t(`stages.${stage.key}`)}
          </span>
          <span className={`text-xs font-bold ${stage.color} opacity-60`}>
            {clients.length}
          </span>
        </div>
        {total > 0 && (
          <p className={`text-xs mt-0.5 font-medium ${stage.color} opacity-70`}>
            {money(total, locale)}
          </p>
        )}
      </div>

      {/* Drop zone + cards */}
      <div
        className={`flex-1 space-y-2 min-h-[80px] rounded-xl transition-colors ${
          dragOver ? "bg-indigo-50/50 ring-2 ring-indigo-300 ring-inset" : ""
        }`}
      >
        {clients.map((c) => (
          <ClientCard
            key={c.id}
            client={c}
            onClick={() => onCardClick(c)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {clients.length === 0 && (
          <div className={`rounded-xl border-2 border-dashed h-20 flex items-center justify-center transition-colors ${
            dragOver ? "border-indigo-300 bg-indigo-50" : "border-slate-200"
          }`}>
            <span className="text-xs text-slate-400">{t("board.dropHere")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function PipelineBoard({ initialClients, title, owner }: { initialClients: PipelineClient[]; title?: string; owner?: React.ReactNode }) {
  const { t, i18n } = useTranslation("pipeline");
  const locale = intlLocale(i18n.language);
  const [clients, setClients] = useState<PipelineClient[]>(initialClients);
  const [selected, setSelected] = useState<PipelineClient | null>(null);
  const [, startTransition] = useTransition();
  const draggingId = useRef<string | null>(null);

  function onDragStart(e: React.DragEvent, id: string) {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragEnd() { draggingId.current = null; }

  function onDrop(stage: PipelineStage) {
    const id = draggingId.current;
    if (!id) return;
    const client = clients.find((c) => c.id === id);
    if (!client || client.pipeline_stage === stage) return;

    // Optimistic update
    const now = new Date().toISOString();
    setClients((prev) =>
      prev.map((c) => c.id === id ? { ...c, pipeline_stage: stage, stage_changed_at: now } : c)
    );

    startTransition(async () => {
      await patchClient(id, { pipeline_stage: stage });
    });
  }

  function handleUpdate(id: string, patch: Partial<PipelineClient>) {
    setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, ...patch } : prev);
  }

  // Stats
  const wonClients   = clients.filter((c) => c.pipeline_stage === "won");
  const activeClients = clients.filter((c) => !["won", "lost"].includes(c.pipeline_stage));
  const pipelineValue = activeClients.reduce((s, c) => s + (c.expected_value ?? 0), 0);
  const wonValue      = wonClients.reduce((s, c) => s + (c.expected_value ?? c.lifetime_value ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            {owner ? <div className="mb-3">{owner}</div> : null}
            <h1 className="text-2xl font-semibold text-slate-900">{title ?? t("board.title")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t("board.subtitle", { count: activeClients.length })}
            </p>
          </div>
          <div className="flex items-center gap-6">
            {pipelineValue > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-500">{t("board.pipelineValue")}</p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{money(pipelineValue, locale)}</p>
              </div>
            )}
            {wonValue > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-500">{t("board.won")}</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">{money(wonValue, locale)}</p>
              </div>
            )}
            <Link
              href="/clients"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Users className="w-4 h-4" />
              {t("board.manageClients")}
            </Link>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex gap-4 h-full">
          {STAGES.map((stage) => (
            <BoardColumn
              key={stage.key}
              stage={stage}
              clients={clients.filter((c) => c.pipeline_stage === stage.key)}
              onCardClick={(c) => setSelected(c)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          client={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Trash2, Phone, Users, Mail, MessageSquare, StickyNote, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { addClientNote, deleteClientNote } from "@/lib/actions/client-notes";
import type { NoteKind } from "@helm/dna-knowledge";

interface Note {
  id: string;
  body: string;
  kind: string;
  created_at: string;
}

interface Props {
  clientId: string;
  initialNotes: Note[];
}

const KIND_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  note:       { icon: StickyNote,    color: "text-slate-500 bg-slate-100" },
  call:       { icon: Phone,         color: "text-emerald-600 bg-emerald-50" },
  meeting:    { icon: Users,         color: "text-indigo-600 bg-indigo-50" },
  email:      { icon: Mail,          color: "text-blue-600 bg-blue-50" },
  follow_up:  { icon: MessageSquare, color: "text-amber-600 bg-amber-50" },
};

const KINDS: NoteKind[] = ["note", "call", "meeting", "email", "follow_up"];

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: Translate, language: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return t("time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("time.daysAgo", { n: d });
  return new Date(iso).toLocaleDateString(intlLocale(language), { month: "short", day: "numeric", year: "numeric" });
}

export function ClientNotesPanel({ clientId, initialNotes }: Props) {
  const { t, i18n }           = useTranslation("clients");
  const [notes, setNotes]     = useState(initialNotes);
  const [body, setBody]       = useState("");
  const [kind, setKind]       = useState<NoteKind>("note");
  const [error, setError]     = useState("");
  const [addPending, startAdd]    = useTransition();
  const [delPending, startDelete] = useTransition();

  function handleAdd() {
    if (!body.trim()) { setError(t("notes.errors.empty")); return; }
    setError("");
    const optimistic: Note = { id: crypto.randomUUID(), body: body.trim(), kind, created_at: new Date().toISOString() };
    setNotes((prev) => [optimistic, ...prev]);
    const savedBody = body.trim();
    const savedKind = kind;
    setBody("");
    startAdd(async () => {
      try {
        await addClientNote(clientId, savedBody, savedKind);
      } catch (err) {
        console.error("save client note", err);
        setError(t("notes.errors.saveFailed"));
        setNotes((prev) => prev.filter((n) => n.id !== optimistic.id));
      }
    });
  }

  function handleDelete(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    startDelete(async () => {
      try {
        await deleteClientNote(noteId, clientId);
      } catch {
        // Silent — already removed from UI
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("notes.title")}</h3>
      </div>

      {/* Add note */}
      <div className="p-4 border-b border-slate-100">
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          rows={3}
          placeholder={t("notes.placeholder")}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        <div className="flex items-center justify-between mt-2">
          <div className="relative">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as NoteKind)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 pr-6 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600"
            >
              {KINDS.map((k) => <option key={k} value={k}>{t(`notes.kinds.${k}`)}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={handleAdd}
            disabled={addPending || !body.trim()}
            className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {addPending ? t("common:status.saving") : t("notes.add")}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {notes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">{t("notes.empty")}</p>
        ) : (
          notes.map((note) => {
            const cfg = KIND_CONFIG[note.kind] ?? KIND_CONFIG.note;
            const Icon = cfg.icon;
            return (
              <div key={note.id} className="flex items-start gap-3 px-4 py-3 group hover:bg-slate-50 transition-colors">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.color}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{note.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t(`notes.kinds.${note.kind}`, { defaultValue: note.kind })} · {timeAgo(note.created_at, t, i18n.language)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={delPending}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

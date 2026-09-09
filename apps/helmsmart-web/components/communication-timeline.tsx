"use client";

import { useState } from "react";
import { Phone, MessageCircle, Mail, FileText, Calendar, Clock, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";

interface Log {
  id: string;
  type: "call" | "sms" | "email" | "note" | "appointment" | "other";
  direction?: "inbound" | "outbound";
  status?: string;
  body?: string;
  subject?: string;
  duration_seconds?: number;
  sentiment?: string;
  created_at: string;
  from_ai_employee_id?: string;
}

interface Props {
  logs: Log[];
  onAddNote?: (note: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  call: {
    icon: <Phone className="w-4 h-4" />,
    color: "bg-blue-50 border-blue-200 text-blue-900",
  },
  sms: {
    icon: <MessageCircle className="w-4 h-4" />,
    color: "bg-green-50 border-green-200 text-green-900",
  },
  email: {
    icon: <Mail className="w-4 h-4" />,
    color: "bg-purple-50 border-purple-200 text-purple-900",
  },
  note: {
    icon: <FileText className="w-4 h-4" />,
    color: "bg-amber-50 border-amber-200 text-amber-900",
  },
  appointment: {
    icon: <Calendar className="w-4 h-4" />,
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
  },
  other: {
    icon: <Clock className="w-4 h-4" />,
    color: "bg-slate-50 border-slate-200 text-slate-900",
  },
};

export function CommunicationTimeline({ logs, onAddNote }: Props) {
  const { t, i18n } = useTranslation("clients");
  const [filter, setFilter] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");

  const filtered = filter ? logs.filter((l) => l.type === filter) : logs;

  const handleAddNote = () => {
    if (newNote.trim() && onAddNote) {
      onAddNote(newNote.trim());
      setNewNote("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            filter === null
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t("timeline.all")}
        </button>
        {Object.entries(TYPE_CONFIG).map(([type, config]) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 transition-colors ${
              filter === type ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {config.icon}
            {t(`timeline.types.${type}`)}
          </button>
        ))}
      </div>

      {/* Add note */}
      {onAddNote && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-600 mb-2">{t("timeline.addNote")}</p>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder={t("timeline.notePlaceholder")}
            rows={2}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim()}
              className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
            >
              {t("timeline.saveNote")}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500">
              {filter
                ? t("timeline.emptyFiltered", { type: t(`timeline.types.${filter}`) })
                : t("timeline.empty")}
            </p>
          </div>
        ) : (
          filtered.map((log) => {
            const config = TYPE_CONFIG[log.type];
            return (
              <div
                key={log.id}
                className={`border rounded-lg p-4 ${config.color}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 pt-1">{config.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{t(`timeline.types.${log.type}`)}</p>
                      {log.direction && (
                        <span className="text-xs opacity-75">
                          ({log.direction === "inbound" ? t("timeline.received") : t("timeline.sent")})
                        </span>
                      )}
                      {log.status && log.type !== "appointment" && (
                        <span className="text-xs opacity-75">• {log.status}</span>
                      )}
                      {log.duration_seconds && (
                        <span className="text-xs opacity-75">
                          • {t("timeline.duration", {
                            minutes: Math.floor(log.duration_seconds / 60),
                            seconds: log.duration_seconds % 60,
                          })}
                        </span>
                      )}
                      {log.sentiment && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            log.sentiment === "positive"
                              ? "bg-emerald-100"
                              : log.sentiment === "negative"
                                ? "bg-rose-100"
                                : "bg-slate-100"
                          }`}
                        >
                          {t(`timeline.sentiment.${log.sentiment}`, { defaultValue: log.sentiment })}
                        </span>
                      )}
                    </div>

                    {log.subject && (
                      <p className="text-sm font-medium mt-1">{log.subject}</p>
                    )}
                    {log.body && (
                      <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-3">
                        {log.body}
                      </p>
                    )}

                    <p className="text-xs opacity-60 mt-2">
                      {new Date(log.created_at).toLocaleDateString(intlLocale(i18n.language), {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {log.from_ai_employee_id && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {t("timeline.aiBadge")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

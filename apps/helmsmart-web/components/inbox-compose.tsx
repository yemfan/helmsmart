"use client";

import { useState, useTransition } from "react";
import { X, Send, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sendEmail, sendSms } from "@/lib/actions/messages";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  clients: Client[];
  onClose: () => void;
  onSent: () => void;
}

export function InboxCompose({ clients, onClose, onSent }: Props) {
  const { t } = useTranslation("inbox");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [clientId, setClientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedClient = clients.find((c) => c.id === clientId);

  function handleSend() {
    if (!clientId || !body.trim()) return;
    setError(null);

    startTransition(async () => {
      try {
        if (channel === "email") {
          if (!selectedClient?.email) { setError(t("compose.errors.noEmail")); return; }
          await sendEmail(clientId, selectedClient.email, subject || t("compose.noSubject"), body.trim());
        } else {
          if (!selectedClient?.phone) { setError(t("compose.errors.noPhone")); return; }
          await sendSms(clientId, selectedClient.phone, body.trim());
        }
        onSent();
        onClose();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("compose.errors.sendFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{t("compose.title")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Channel toggle */}
          <div className="flex gap-2">
            {(["email", "sms"] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  channel === ch
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t(`list.filters.${ch}`)}
              </button>
            ))}
          </div>

          {/* Client selector */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("compose.to")}</label>
            <div className="relative">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
              >
                <option value="">{t("compose.selectClient")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || t("compose.unnamedClient")}
                    {channel === "email" && c.email ? ` — ${c.email}` : ""}
                    {channel === "sms"   && c.phone ? ` — ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Subject (email only) */}
          {channel === "email" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("compose.subject")}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("compose.subjectPlaceholder")}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("compose.message")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={t(`compose.bodyPlaceholder.${channel}`)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            {channel === "sms" && (
              <p className="text-right text-xs text-slate-400 mt-1">{body.length} / 160</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            {t("compose.cancel")}
          </button>
          <button
            onClick={handleSend}
            disabled={isPending || !clientId || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {isPending ? t("common:status.sending") : t("compose.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

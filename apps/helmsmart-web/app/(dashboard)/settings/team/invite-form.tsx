"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { inviteMember } from "@/lib/actions/team";

type Role = "admin" | "bookkeeper" | "viewer";

/** Enum values the server reads; label and description are bundle keys. */
const ROLES: Role[] = ["admin", "bookkeeper", "viewer"];

export function InviteForm() {
  const { t } = useTranslation("settings");
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState<Role>("viewer");
  const [error, setError] = useState("");
  const [done, setDone]   = useState(false);
  const [pending, start]  = useTransition();

  function handleSubmit() {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError(t("team.invite.invalidEmail"));
      return;
    }
    setError("");
    setDone(false);
    start(async () => {
      try {
        await inviteMember(email.trim().toLowerCase(), role);
        setEmail("");
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("team.invite.genericError"));
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{t("team.invite.title")}</h2>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("team.invite.emailLabel")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDone(false); }}
            placeholder={t("team.invite.emailPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("team.invite.roleLabel")}</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t("team.invite.roleOption", {
                  label: t(`team.roles.${r}`),
                  description: t(`team.roleDescriptions.${r}`),
                })}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <Send className="w-4 h-4" />
          {pending ? t("team.invite.sending") : t("team.invite.send")}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-2">{error}</p>
      )}
      {done && (
        <p className="mt-3 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-4 py-2">
          {t("team.invite.sent", { email: email || t("team.invite.sentFallbackRecipient") })}
        </p>
      )}
    </div>
  );
}

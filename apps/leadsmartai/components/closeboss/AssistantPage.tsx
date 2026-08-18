"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AssistantDef } from "@/lib/closeboss/team";
import { AssistantAvatar } from "@/components/closeboss/AssistantAvatar";
import { defaultAvatarForType } from "@/lib/closeboss/avatars";

/** Header block shared by the AI-team pages — name, mission, skills, action links. */
type AssistantAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export function AssistantHeader({
  assistant,
  actions,
}: {
  assistant: AssistantDef;
  actions?: AssistantAction[];
}) {
  const { t } = useTranslation("dashboard");
  // Overlay the agent's customized name + avatar (set on Manage Your AI Team)
  // so every assistant page shows the same identity, not the roster default.
  const [custom, setCustom] = useState<{
    name: string;
    avatar_id: string;
    avatar_url: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/closeboss/team")
      .then((r) => r.json())
      .then((res) => {
        if (!active || !res?.ok) return;
        const row = (res.assistants ?? []).find(
          (a: { type?: string }) => a.type === assistant.type,
        ) as { name?: string; avatar_id?: string; avatar_url?: string | null } | undefined;
        if (row) {
          setCustom({
            name: row.name || assistant.displayName,
            avatar_id: row.avatar_id || defaultAvatarForType(assistant.type),
            avatar_url: row.avatar_url ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [assistant.type, assistant.name]);

  const name = assistant.displayName;
  const avatarId = custom?.avatar_id || defaultAvatarForType(assistant.type);
  const avatarUrl = custom?.avatar_url ?? null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <AssistantAvatar id={avatarId} url={avatarUrl} size={44} alt={name} className="mt-1" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{t("assistants.yourAiTeam")}</p>
          <h1 className="mt-0.5 text-xl font-semibold text-gray-900">{name}</h1>
          <p className="text-sm font-medium text-gray-600">{t(`roster.${assistant.type}.name`, { defaultValue: assistant.name })}</p>
          <p className="text-xs text-gray-400">{t(`assistants.personality.${assistant.type}`, { defaultValue: assistant.personality })}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assistant.skills.map((s) => (
              <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {t(`assistants.skills.${s}`, { defaultValue: s.replace(/_/g, " ") })}
              </span>
            ))}
          </div>
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex shrink-0 gap-2">
          {actions.map((a) =>
            a.href ? (
              <Link key={a.label} href={a.href} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                {a.label}
              </Link>
            ) : (
              <button key={a.label} type="button" onClick={a.onClick} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** KPI stat card used on the AI-team pages. */
export function AssistantKpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: "hot" | "warn";
}) {
  const valueClass = tone === "hot" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value ?? "—"}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}
